import type { Task } from "../../db/schema";
import type {
  ActivityEvent,
  ConnectorInfo,
  EntityType,
  MirrorRow,
  SnapshotInfo,
  SyncSink,
} from "./sources";

/**
 * In-memory SyncSink for engine tests — same semantics as SqliteSink,
 * nothing persisted. Watermark advances are monotone; upserts keep the
 * latest version; tombstones set deletedAt.
 */
export class MemorySink implements SyncSink {
  connectors = new Map<string, ConnectorInfo & { deletedAt: number | null }>();
  mirror = new Map<
    string,
    SnapshotInfo & { deletedAt: number | null; createdAt: number }
  >();
  events: ActivityEvent[] = [];
  tasks = new Map<string, Task>();
  watermarks = new Map<string, number>();
  fullReconcileAt = new Map<string, number>();
  now: number;

  constructor(now = 1_750_000_000_000) {
    this.now = now;
  }

  private mirrorKey(connectorId: string, entityType: EntityType, externalId: string) {
    return `${connectorId}:${entityType}:${externalId}`;
  }

  async upsertConnectors(cs: ConnectorInfo[], _now: number): Promise<void> {
    for (const c of cs) {
      const existing = this.connectors.get(c.id);
      this.connectors.set(c.id, {
        ...c,
        deletedAt: existing?.deletedAt ?? null,
      });
    }
  }

  async tombstoneConnectors(liveIds: string[], now: number): Promise<void> {
    for (const [id, c] of this.connectors) {
      if (!liveIds.includes(id) && c.deletedAt === null) {
        this.connectors.set(id, { ...c, deletedAt: now });
      }
    }
  }

  async listConnectors(): Promise<ConnectorInfo[]> {
    return [...this.connectors.values()]
      .filter((c) => c.deletedAt === null)
      .map(({ deletedAt: _d, ...c }) => c);
  }

  async upsertSnapshots(items: SnapshotInfo[], now: number): Promise<void> {
    for (const s of items) {
      const key = this.mirrorKey(s.connectorId, s.entityType, s.externalId);
      const existing = this.mirror.get(key);
      if (
        existing &&
        existing.deletedAt === null &&
        existing.version >= s.version
      ) {
        continue; // idempotent no-op
      }
      this.mirror.set(key, {
        ...s,
        deletedAt: existing?.deletedAt ?? null,
        createdAt: existing?.createdAt ?? now,
      });
    }
  }

  async listMirror(includeDeleted = false): Promise<MirrorRow[]> {
    return [...this.mirror.values()]
      .filter((m) => includeDeleted || m.deletedAt === null)
      .map(({ createdAt: _c, ...m }) => m);
  }

  async tombstoneMirror(
    connectorId: string,
    entityType: EntityType,
    seen: Set<string>,
    now: number,
  ): Promise<void> {
    for (const [key, m] of this.mirror) {
      if (
        m.connectorId === connectorId &&
        m.entityType === entityType &&
        !seen.has(m.externalId)
      ) {
        void key;
        this.mirror.set(this.mirrorKey(connectorId, entityType, m.externalId), {
          ...m,
          deletedAt: m.deletedAt ?? now,
        });
      }
    }
  }

  async upsertActivity(events: ActivityEvent[], _now: number): Promise<void> {
    const seen = new Set(this.events.map((e) => e.id));
    for (const e of events) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        this.events.push(e);
      }
    }
    this.events.sort((a, b) => b.timestamp - a.timestamp);
  }

  async listEvents(limit = 20): Promise<ActivityEvent[]> {
    return this.events.slice(0, limit);
  }

  async listTasks(includeArchived = false): Promise<Task[]> {
    return [...this.tasks.values()].filter(
      (t) => includeArchived || t.archivedAt === null,
    );
  }

  async getWatermark(connectorId: string, entityType: EntityType): Promise<number> {
    return this.watermarks.get(`${connectorId}:${entityType}`) ?? 0;
  }

  async setWatermark(
    connectorId: string,
    entityType: EntityType,
    watermark: number,
    _now: number,
  ): Promise<void> {
    const key = `${connectorId}:${entityType}`;
    const current = this.watermarks.get(key) ?? 0;
    this.watermarks.set(key, Math.max(current, watermark));
  }

  async markFullReconcile(
    connectorId: string,
    entityType: EntityType,
    now: number,
  ): Promise<void> {
    this.fullReconcileAt.set(`${connectorId}:${entityType}`, now);
  }
}
