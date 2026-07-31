import type {
  EntityType,
  SnapshotInfo,
  SyncSink,
  SyncSource,
} from "./sources";
import { ENTITY_TYPES_FOR } from "./sources";
import { planDerive, type DerivePlan } from "./derive";

/**
 * The sync engine (docs/sync-engine.md §3 — implement exactly).
 * Polls tier 1 (connectors) every 45s, tier 3 (events) every 60s,
 * reconciles snapshots only when tier 1 reports change, and runs a full
 * reconcile on boot + daily.
 */

export const TIER1_MS = 45_000;
export const TIER3_MS = 60_000;
export const OVERLAP_MS = 60_000;
export const FULL_RECONCILE_INTERVAL_MS = 24 * 3_600_000;
export const EVENT_WINDOW_MS = 3 * 3_600_000;
export const EVENT_FIRST_WINDOW_MS = 24 * 3_600_000;
export const PAGE_SIZE = 200;
export const BACKOFF_STEPS_MS = [45_000, 120_000, 300_000, 900_000];

export type SyncEvent =
  | { type: "connectors"; detail?: unknown }
  | { type: "mirror"; detail?: unknown }
  | { type: "activity"; detail?: unknown }
  | { type: "health"; detail?: { ok: boolean; message?: string } }
  | { type: "derive"; detail?: unknown };

export interface EngineDeps {
  source: SyncSource;
  sink: SyncSink;
  now?: () => number;
  /** Persist a derive plan (SqliteSink writes via tasks repo; tests pass MemorySink). */
  writeDerive?: (plan: DerivePlan) => Promise<void>;
  /** Auto-start the loop; false in tests. */
  autostart?: boolean;
}

/**
 * Minimal token bucket (docs/api-contract.md §4.5): burst of `burst`, then
 * `rate` per second steady. Only applied to live sources.
 */
class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly burst: number,
    private readonly rate: number,
    private readonly now: () => number,
  ) {
    this.tokens = burst;
    this.last = now();
  }

  async take(): Promise<void> {
    while (true) {
      const t = this.now();
      this.tokens = Math.min(this.burst, this.tokens + (t - this.last) * (this.rate / 1000));
      this.last = t;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

export class SyncEngine {
  private readonly source: SyncSource;
  private readonly sink: SyncSink;
  private readonly now: () => number;
  private readonly bucket: TokenBucket | null;
  private readonly writeDerive: (plan: DerivePlan) => Promise<void>;

  private listeners = new Set<(e: SyncEvent) => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private running = false;
  private backoffIndex = 0;
  private lastTier3Since = 0;
  private lastFullReconcileAt = 0;
  private syncing = new Set<string>();
  private health: { ok: boolean; message?: string } = { ok: true };

  constructor(deps: EngineDeps) {
    this.source = deps.source;
    this.sink = deps.sink;
    this.now = deps.now ?? Date.now;
    this.writeDerive = deps.writeDerive ?? (async () => {});
    this.bucket = deps.source.constructor.name === "ReconcileSyncSource"
      ? new TokenBucket(5, 1, this.now)
      : null;
    if (deps.autostart ?? true) void this.start();
  }

  // -- event bus -----------------------------------------------------------

  subscribe(cb: (e: SyncEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(e: SyncEvent): void {
    for (const cb of this.listeners) cb(e);
  }

  getHealth(): { ok: boolean; message?: string } {
    return this.health;
  }

  // -- lifecycle -----------------------------------------------------------

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.safeRun("boot full reconcile", () => this.fullReconcile());
    this.lastFullReconcileAt = this.now();
    this.schedule(TIER1_MS, () => this.tier1());
    this.schedule(TIER3_MS, () => this.tier3());
    this.schedule(FULL_RECONCILE_INTERVAL_MS, () => this.fullReconcile());
  }

  stop(): void {
    this.running = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private schedule(ms: number, fn: () => Promise<void>): void {
    const timer = setTimeout(async () => {
      await this.safeRun("scheduled", fn);
      if (this.running) this.schedule(ms, fn);
    }, ms);
    this.timers.push(timer);
  }

  /** Manual "Sync now" — immediate reconcile + tier3, debounced by caller. */
  async syncNow(connectorId: string): Promise<void> {
    if (this.syncing.has(connectorId)) return;
    this.syncing.add(connectorId);
    try {
      await this.safeRun("manual sync", async () => {
        await this.reconcileConnector(connectorId);
        await this.tier3();
      });
    } finally {
      this.syncing.delete(connectorId);
    }
  }

  /** "Sync all" — each connector once, sequentially (used by the sidebar). */
  async syncAll(): Promise<void> {
    const connectors = await this.sink.listConnectors();
    for (const c of connectors) {
      if (c.status === "disabled") continue;
      await this.syncNow(c.id);
    }
  }

  isSyncing(connectorId: string): boolean {
    return this.syncing.has(connectorId);
  }

  // -- failure handling (docs/sync-engine.md §5) ----------------------------

  private async safeRun(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      if (this.backoffIndex > 0) {
        this.backoffIndex = 0;
        this.health = { ok: true };
        this.notify({ type: "health", detail: this.health });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const delay = BACKOFF_STEPS_MS[Math.min(this.backoffIndex, BACKOFF_STEPS_MS.length - 1)];
      this.backoffIndex += 1;
      this.health = { ok: false, message };
      this.notify({ type: "health", detail: this.health });
      console.warn(`[sync] ${label} failed (retrying in ${delay / 1000}s): ${message}`);
      this.timers.push(setTimeout(() => void this.safeRun(label, fn), delay));
    }
  }

  // -- tier 1: connectors change signal ------------------------------------

  async tier1(): Promise<void> {
    const upstream = await this.source.listConnectors();
    const local = await this.sink.listConnectors();
    const localById = new Map(local.map((c) => [c.id, c]));

    let changed = false;
    for (const u of upstream) {
      const l = localById.get(u.id);
      if (
        !l ||
        l.lastSyncAt !== u.lastSyncAt ||
        l.status !== u.status ||
        l.lastSyncStatus !== u.lastSyncStatus ||
        l.updatedAt !== u.updatedAt
      ) {
        changed = true;
      }
    }

    await this.sink.upsertConnectors(upstream, this.now());
    await this.sink.tombstoneConnectors(upstream.map((c) => c.id), this.now());

    if (changed) {
      for (const c of upstream) {
        if (c.status === "disabled") continue;
        await this.reconcileConnector(c.id);
      }
      await this.tier3();
    }

    this.notify({ type: "connectors" });
    this.notify({ type: "mirror" });
  }

  /** Reconcile every entity type of one connector (tier1 + manual sync). */
  async reconcileConnector(connectorId: string): Promise<void> {
    const connectors = await this.sink.listConnectors();
    const c = connectors.find((x) => x.id === connectorId);
    if (!c || c.status === "disabled") return;
    for (const entityType of ENTITY_TYPES_FOR[c.type] ?? []) {
      await this.reconcile(connectorId, entityType);
    }
    await this.derive();
    this.notify({ type: "mirror" });
  }

  // -- tier 2: snapshot reconcile (early-exit at watermark) ----------------

  /**
   * Walk pages DESC, early-exit at the watermark, upsert one atomic batch.
   * Returns the external ids seen on this walk (used by full reconcile's
   * tombstone pass — everything NOT seen here is stale upstream).
   */
  async reconcile(
    connectorId: string,
    entityType: EntityType,
    fromZero = false,
  ): Promise<Set<string>> {
    const watermark = fromZero
      ? 0
      : (await this.sink.getWatermark(connectorId, entityType)) - OVERLAP_MS;
    let offset = 0;
    const processed: SnapshotInfo[] = [];
    const seen = new Set<string>();
    while (true) {
      await this.bucket?.take();
      const { items, total } = await this.source.listSnapshots({
        connectorId,
        entityType,
        limit: PAGE_SIZE,
        offset,
      });
      if (items.length === 0) break;
      const first = items[0];
      if (first.updatedAt <= watermark) break; // ordered DESC → nothing new after
      const upsert = items.filter((s) => s.updatedAt > watermark);
      for (const s of upsert) seen.add(s.externalId);
      processed.push(...upsert);
      offset += items.length;
      if (offset >= total) break;
    }

    if (processed.length > 0) {
      await this.sink.upsertSnapshots(processed, this.now());
    }
    const newWatermark = processed.reduce((m, s) => Math.max(m, s.updatedAt), 0);
    if (newWatermark > 0) {
      await this.sink.setWatermark(connectorId, entityType, newWatermark, this.now());
    }
    return seen;
  }

  // -- tier 3: activity feed -----------------------------------------------

  async tier3(): Promise<void> {
    const now = this.now();
    const since =
      this.lastTier3Since ||
      now - (this.lastFullReconcileAt ? EVENT_WINDOW_MS : EVENT_FIRST_WINDOW_MS);
    this.lastTier3Since = now;
    await this.bucket?.take();
    const events = await this.source.listRecentEvents({ since, limit: PAGE_SIZE });
    await this.sink.upsertActivity(events, now);
    this.notify({ type: "activity" });
  }

  // -- full reconcile (boot + daily) ---------------------------------------

  async fullReconcile(): Promise<void> {
    const connectors = await this.source.listConnectors();
    for (const c of connectors) {
      if (c.status === "disabled") continue;
      for (const entityType of ENTITY_TYPES_FOR[c.type] ?? []) {
        const seen = await this.reconcile(c.id, entityType, true);
        await this.sink.tombstoneMirror(c.id, entityType, seen, this.now());
        await this.sink.markFullReconcile(c.id, entityType, this.now());
      }
    }
    await this.derive();
    this.lastFullReconcileAt = this.now();
    this.notify({ type: "mirror" });
    this.notify({ type: "derive" });
  }

  // -- derivation hook (docs/sync-engine.md §8) ----------------------------

  async derive(): Promise<void> {
    const mirror = await this.sink.listMirror(true);
    const existing = await this.sink.listTasks(true);
    const plan = planDerive(mirror, existing, this.now());
    if (plan.upserts.length > 0 || plan.archives.length > 0) {
      await this.writeDerive(plan);
      this.notify({ type: "derive" });
    }
  }
}
