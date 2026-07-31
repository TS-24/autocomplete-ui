# Sync Engine

The engine's job: keep the local mirror (SQLite) faithful to the PKS API with minimal API
calls, then re-derive the planning layer. It lives entirely in TypeScript
(`src/lib/sync/`), runs in the webview, and talks to PKS through the Rust `pks_fetch`
command. There is **no push**; this is a polling design (see `docs/api-contract.md` §4.1).

## 1. Interfaces (`src/lib/sync/sources.ts`)

```ts
export type EntityType = 'email' | 'calendar_event' | 'assignment' | 'grade'

export interface ConnectorInfo {
  id: string; type: string; name: string; status: string;
  lastSyncAt: number | null; lastSyncStatus: string | null; errorCount: number;
  updatedAt: number | null   // epoch ms
}

export interface SnapshotInfo {
  connectorId: string; entityType: EntityType; externalId: string;
  payload: Record<string, unknown>; version: number; updatedAt: number // epoch ms
}

export interface ActivityEvent {
  id: string; source: string; type: string; timestamp: number;
  payload: Record<string, unknown> | null
}

export interface SyncSource {
  listConnectors(): Promise<ConnectorInfo[]>
  listSnapshots(opts: { connectorId: string; entityType: EntityType;
                        limit: number; offset: number }): Promise<{ items: SnapshotInfo[]; total: number }>
  listRecentEvents(opts: { since: number; limit: number }): Promise<ActivityEvent[]>
  triggerSync(connectorId: string): Promise<void>          // POST /connectors/{id}/sync
  checkHealth(): Promise<{ ok: boolean; version?: string; detail?: string }>
}

export interface SyncSink { // implemented by repos
  upsertConnectors(cs: ConnectorInfo[]): Promise<void>
  upsertSnapshots(items: SnapshotInfo[]): Promise<void>    // atomic via sql_batch
  upsertActivity(events: ActivityEvent[]): Promise<void>
  getWatermark(connectorId: string, entityType: EntityType): Promise<number>
  setWatermark(connectorId: string, entityType: EntityType, watermark: number): Promise<void>
  tombstoneConnector(id: string): Promise<void>
  tombstoneMirror(connectorId: string, entityType: EntityType, seenExternalIds: Set<string>): Promise<void>
  markFullReconcile(connectorId: string, entityType: EntityType, at: number): Promise<void>
  listStaleMirrorRows(before: number): Promise<Array<{ connectorId: string; entityType: EntityType; externalId: string }>>
}
```

Two implementations:
- `ReconcileSyncSource` — calls the live API via `pks_fetch` (Zod-parsed).
- `FixtureSyncSource` — returns fixture data (`lib/pks/fixtures.ts`), **no network**;
  also delays ~50ms per call to simulate latency. Selection by settings `dataMode`.

## 2. Tiers

| Tier | What | Cadence | Cost |
|---|---|---|---|
| 1 | `listConnectors()` change signal | every 45s | 1 request |
| 2 | snapshot reconcile (early-exit) | only when tier 1 reports change | ≤ total snapshots / 200 requests |
| 3 | `listRecentEvents()` activity feed | every 60s + after each tier 2 | 1 request (limit 200) |
| F | full reconcile | app launch + once daily (idle) | 4 entity types × pages |

Tier 1 is the "detect that update" mechanism: a 45-second poll is effectively push for a
personal dashboard — the backend itself polls sources every 15 minutes.

## 3. Engine loop (pseudocode — implement exactly)

```
engine.start():
  await fullReconcile()                     # boot: catch everything
  schedule(45s): tier1()
  schedule(60s): tier3()
  schedule(daily, when idle): fullReconcile()
  listen('manual-sync'): for connectorId → reconcileConnector(connectorId)

tier1():
  upstream = source.listConnectors()
  local = sink.listConnectors()             # map by id
  changed = false
  for u in upstream:
    l = local[u.id]
    if !l || l.lastSyncAt != u.lastSyncAt || l.status != u.status
       || l.lastSyncStatus != u.lastSyncStatus || l.updatedAt != u.updatedAt:
      changed = true
  sink.upsertConnectors(upstream)           # always — keeps display fresh
  sink.tombstoneConnectors(upstreamIds)     # ids gone upstream → tombstone
  if changed:
    for c in upstream (status != disabled):
      for entityType in ENTITY_TYPES_FOR[c.type]:
        await reconcile(connectorId, entityType)
    await tier3()
  notify({ type: 'connectors' }); notify({ type: 'mirror' })

ENTITY_TYPES_FOR = { gmail: ['email'], google_calendar: ['calendar_event'],
                     d2l: ['assignment', 'grade'], _: [] }

reconcile(connectorId, entityType):
  watermark = sink.getWatermark(connectorId, entityType) - OVERLAP_MS   # OVERLAP_MS = 60_000
  offset = 0; processed = []; sawNew = false
  while true:
    { items, total } = source.listSnapshots({ connectorId, entityType, limit: 200, offset })
    if items.length == 0: break
    first = items[0]
    if first.updatedAt <= watermark:       # ordered DESC → everything after is older → STOP
      break
    upsert = items.filter(s => s.updatedAt > watermark)   # keep overlap rows (idempotent anyway)
    sawNew ||= upsert.length > 0
    processed.push(...upsert)
    offset += items.length
    if offset >= total: break
  if processed.length: sink.upsertSnapshots(processed)    # ONE sql_batch call
  newWatermark = max(processed.map(s => s.updatedAt)) or 0
  if newWatermark > 0: sink.setWatermark(connectorId, entityType, newWatermark)
  # note: watermark NEVER moves backward; if upstream rows vanish (deletes), the
  # watermark stays put until fullReconcile() clears the tombstone.

tier3():
  since = now - 3h (first run: now - 24h)
  events = source.listRecentEvents({ since, limit: 200 })
  sink.upsertActivity(events.filter(e => !exists(e.id)))   # dedupe by UUID
  notify({ type: 'activity' })

fullReconcile():
  connectors = source.listConnectors()
  for c in connectors (status != disabled):
    for entityType in ENTITY_TYPES_FOR[c.type]:
      reconcile(connectorId=c.id, entityType, fromZero=true)   # watermark ignored
      # then tombstone rows unseen in this pass:
      seen = collectAllExternalIds(c.id, entityType)   # from the walk (may be >1 page)
      sink.tombstoneMirror(c.id, entityType, seen)
      sink.markFullReconcile(c.id, entityType, now)
  notify({ type: 'mirror' })
```

## 4. Correctness properties (these make the design safe)

1. **Early exit is safe because ordering is `updated_at DESC`** (backend
   `snapshot_repo.py`). The first item of a page at/below the watermark implies every
   subsequent item is older → nothing new can follow.
2. **Overlap + idempotency, not boundary exactness.** Bulk syncs stamp near-identical
   `updated_at` values. We rewind 60s, re-fetch boundary rows, and upsert is a no-op for
   `version <= existing`. Overlap makes lost-row risk vanish; idempotency makes double-fetch
   harmless.
3. **Offset drift** (concurrent upstream inserts shift pages): same mitigation as #2, plus
   `fullReconcile()` as a daily backstop.
4. **Never derive state from `/events`** — display only (`since` filters on source-time; see
   api-contract §4.3).
5. **Tombstones, never deletes**: `deletedAt` set, rows excluded from queries. A row that
   reappears upstream simply clears `deletedAt` on upsert. Reconcile only tombstones during
   `fullReconcile` (that's when we've seen the complete id set); tier 2 never tombstones.
6. **Watermark monotonicity**: only ever advances. Row deletions can't regress it.
7. **Fixture determinism**: `FixtureSyncSource` accepts `now`; same input → same output.

## 5. Failure handling

- Any source call throwing: catch, increment consecutive-error counter, back off
  (45s → 2m → 5m → 15m cap), reset on success, surface via `notify({type:'health'})`.
- `upsertSnapshots` (sql_batch) is atomic — a failed batch leaves no partial page.
- On boot, if a previous run crashed mid-page, overlap + idempotency heal it.
- Manual "Sync now": runs `reconcile` immediately for the connector + `tier3()`, ignoring
  the 45s cadence (debounced 2s to avoid button mashing).

## 6. Notifications to the UI

The engine exports a tiny typed event bus:

```ts
type SyncEvent = { type: 'connectors'|'mirror'|'activity'|'health'|'derive';
                   detail?: unknown }
engine.subscribe(cb: (e: SyncEvent) => void): () => void
```

The app root maps these to TanStack Query invalidations: `connectors` → `['connectors']`,
`mirror` → `['mirror']`, `activity` → `['activity']`, `health` → `['sources']`.
`derive` fires after each tier-2 pass and invalidates `['tasks']`.

## 7. Why `sql_batch` exists (performance)

`drizzle-orm/sqlite-proxy` cannot run `db.transaction()`, and the canonical
Tauri+Drizzle pattern (`Database.load()` + `close()` per query) costs one IPC round-trip and
one connection per statement — pathological for a 200-row page. Therefore:
- **Reads**: normal proxy path (plugin pool, one long-lived connection).
- **Multi-statement writes**: collect the prepared statements (`stmt.toSQL()`), send once
  to Rust `sql_batch`, executed in one sqlx transaction on the Rust pool.
- The proxy callback must route `method === 'run'` writes that don't need atomicity through
  the normal `execute` path (simpler, keeps plugin pool warm), and page upserts through
  `sql_batch`. Concretely: `upsertSnapshots` builds `INSERT INTO mirror_entities (...) VALUES (...) ON CONFLICT(connectorId, entityType, externalId) DO UPDATE SET payload=excluded.payload, version=excluded.version, updatedAt=excluded.updatedAt, deletedAt=NULL WHERE excluded.version > mirror_entities.version OR mirror_entities.deletedAt IS NOT NULL`.

## 8. Derivation hook

After each tier-2 pass and each full reconcile, the engine calls `deriveAll()` from
`src/lib/sync/derive.ts` — see `docs/domain-model.md`. It is idempotent: given the same
mirror, it produces the same tasks. It runs inside the same engine loop, never in the UI.
