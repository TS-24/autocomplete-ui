import { describe, expect, it, vi } from "vitest";
import { MemorySink } from "./memorySink";
import { SyncEngine } from "./engine";
import type { SyncSource, SnapshotInfo, ConnectorInfo } from "./sources";

const T0 = 1_750_000_000_000;

function snapshot(
  externalId: string,
  updatedAt: number,
  version = 1,
): SnapshotInfo {
  return {
    connectorId: "conn-d2l",
    entityType: "assignment",
    externalId,
    payload: { external_id: externalId, status: "not submitted" },
    version,
    updatedAt,
  };
}

/** Deterministic source: a fixed pageable list, sorted updated_at DESC. */
class StubSource implements SyncSource {
  snapshots: SnapshotInfo[] = [];
  events: { id: string; timestamp: number }[] = [];
  connectors: ConnectorInfo[] = [
    {
      id: "conn-d2l",
      type: "d2l",
      name: "D2L",
      status: "active",
      lastSyncAt: T0,
      lastSyncStatus: "success",
      errorCount: 0,
      updatedAt: T0,
    },
  ];
  failNext = 0;
  calls: string[] = [];

  constructor() {
    for (let i = 20; i >= 1; i--) {
      this.snapshots.push(snapshot(`asg-${i}`, T0 - i * 60_000, 1));
    }
    this.snapshots.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async listConnectors() {
    this.calls.push("listConnectors");
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("boom");
    }
    return this.connectors;
  }

  async listSnapshots(opts: { offset: number; limit: number }) {
    this.calls.push(`listSnapshots@${opts.offset}`);
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("boom");
    }
    const items = this.snapshots.slice(opts.offset, opts.offset + opts.limit);
    return { items, total: this.snapshots.length };
  }

  async listRecentEvents(opts: { since: number; limit: number }) {
    this.calls.push("listRecentEvents");
    return this.events
      .filter((e) => e.timestamp >= opts.since)
      .slice(0, opts.limit)
      .map((e) => ({ id: e.id, source: "d2l", type: "x", timestamp: e.timestamp, payload: null }));
  }

  async triggerSync() {}
  async checkHealth() {
    return { ok: true };
  }
}

function engine(source: StubSource, sink: MemorySink) {
  return new SyncEngine({
    source,
    sink,
    now: () => T0,
    autostart: false,
    writeDerive: async () => {},
  });
}

describe("reconcile", () => {
  it("walks pages DESC and early-exits at the watermark", async () => {
    const source = new StubSource();
    source.snapshots = [];
    for (let i = 200; i >= 1; i--) {
      source.snapshots.push(snapshot(`asg-${i}`, T0 - i * 60_000, 1));
    }
    source.snapshots.sort((a, b) => b.updatedAt - a.updatedAt);
    const sink = new MemorySink(T0);
    const e = engine(source, sink);

    await e.reconcile("conn-d2l", "assignment", true);
    expect(sink.mirror.size).toBe(200);
    expect(sink.watermarks.get("conn-d2l:assignment")).toBe(T0 - 60_000);

    // Second run: watermark rewind by OVERLAP → only 1 page fetched, 1 row
    // re-fetched as a no-op upsert, and nothing older.
    source.calls = [];
    sink.mirror.clear();
    await e.reconcile("conn-d2l", "assignment");
    expect(source.calls.filter((c) => c.startsWith("listSnapshots")).length).toBe(1);
    expect(sink.mirror.size).toBe(1);
  });

  it("paginates past the first page when items exceed PAGE_SIZE", async () => {
    const source = new StubSource();
    source.snapshots = [];
    for (let i = 450; i >= 1; i--) {
      source.snapshots.push(snapshot(`asg-${i}`, T0 - i * 60_000, 1));
    }
    source.snapshots.sort((a, b) => b.updatedAt - a.updatedAt);
    const sink = new MemorySink(T0);
    const e = engine(source, sink);

    await e.reconcile("conn-d2l", "assignment", true);
    expect(sink.mirror.size).toBe(450);
    expect(source.calls.filter((c) => c.startsWith("listSnapshots")).length).toBe(3);
  });

  it("skips a page whose first item is at/below the watermark (early exit)", async () => {
    const source = new StubSource();
    source.snapshots = [snapshot("new", T0, 1), snapshot("old", T0 - 10 * 60_000, 1)];
    const sink = new MemorySink(T0);
    const e = engine(source, sink);

    await e.reconcile("conn-d2l", "assignment", true);
    // watermark = T0 → rewind T0-60s → only "new" refetched; "old" never is
    source.calls = [];
    sink.mirror.clear();
    await e.reconcile("conn-d2l", "assignment");
    const mirror = await sink.listMirror();
    expect(mirror.map((m) => m.externalId).sort()).toEqual(["new"]);
  });

  it("is idempotent: re-upserting the same version is a no-op", async () => {
    const source = new StubSource();
    const sink = new MemorySink(T0);
    const e = engine(source, sink);

    await e.reconcile("conn-d2l", "assignment", true);
    const first = [...sink.mirror.values()].map((m) => m.version);
    await e.reconcile("conn-d2l", "assignment", true);
    const second = [...sink.mirror.values()].map((m) => m.version);
    expect(second).toEqual(first);
  });

  it("accepts a newer version of the same snapshot", async () => {
    const source = new StubSource();
    const sink = new MemorySink(T0);
    const e = engine(source, sink);
    await e.reconcile("conn-d2l", "assignment", true);

    source.snapshots = [snapshot("asg-1", T0, 2)];
    await e.reconcile("conn-d2l", "assignment", true);
    const row = sink.mirror.get("conn-d2l:assignment:asg-1")!;
    expect(row.version).toBe(2);
  });
});

describe("tier1", () => {
  it("reconciles only when connectors changed", async () => {
    const source = new StubSource();
    const sink = new MemorySink(T0);
    const e = engine(source, sink);

    await e.tier1();
    expect(sink.mirror.size).toBe(20);
    const callsAfterFirst = source.calls.filter((c) => c.startsWith("listSnapshots")).length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    await e.tier1(); // unchanged upstream
    expect(
      source.calls.filter((c) => c.startsWith("listSnapshots")).length,
    ).toBe(callsAfterFirst);
  });

  it("tombstones connectors that vanished upstream", async () => {
    const source = new StubSource();
    const sink = new MemorySink(T0);
    const e = engine(source, sink);
    await e.tier1();
    expect((await sink.listConnectors()).length).toBe(1);

    source.connectors = [];
    await e.tier1();
    expect(await sink.listConnectors()).toEqual([]);
  });
});

describe("fullReconcile", () => {
  it("tombstones mirror rows not seen upstream", async () => {
    const source = new StubSource();
    const sink = new MemorySink(T0);
    const e = engine(source, sink);
    await e.reconcile("conn-d2l", "assignment", true);
    expect(sink.mirror.size).toBe(20);

    source.snapshots = source.snapshots.slice(5); // 15 of 20 remain
    await e.fullReconcile();
    expect(sink.mirror.size).toBe(20); // tombstones, never deletes
    const live = await sink.listMirror();
    expect(live.length).toBe(15);
    expect(sink.fullReconcileAt.has("conn-d2l:assignment")).toBe(true);
  });
});

describe("failure handling", () => {
  it("backs off and recovers", async () => {
    vi.useFakeTimers();
    try {
      const source = new StubSource();
      const sink = new MemorySink(T0);
      const e = engine(source, sink);
      await sink.upsertConnectors(source.connectors, T0);
      const health: { ok: boolean }[] = [];
      e.subscribe((ev) => {
        if (ev.type === "health") health.push(ev.detail as { ok: boolean });
      });

      // syncNow is failure-safe: it catches, records health, and schedules a
      // retry. First attempt fails inside reconcile (listSnapshots), the
      // retry consumes the second failure, the third succeeds.
      source.failNext = 2;
      const p = e.syncNow("conn-d2l");
      await vi.advanceTimersByTimeAsync(0);
      await p;
      expect(health[health.length - 1]).toEqual({ ok: false, message: "boom" });

      await vi.advanceTimersByTimeAsync(45_000);
      expect(health[health.length - 1]).toEqual({ ok: false, message: "boom" });

      await vi.advanceTimersByTimeAsync(120_000);
      expect(health[health.length - 1]).toEqual({ ok: true });
      expect(sink.mirror.size).toBe(20);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("tier3", () => {
  it("dedupes events by id", async () => {
    const source = new StubSource();
    source.events = [{ id: "evt-1", timestamp: T0 - 1_000 }];
    const sink = new MemorySink(T0);
    const e = engine(source, sink);
    await e.tier3();
    await e.tier3();
    expect(sink.events.length).toBe(1);
  });
});
