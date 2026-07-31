# PKS API Contract (what this UI consumes)

> Source of truth: the **live** backend. The checked-in `docs/data-product/api/openapi.yaml`
> is stale (missing all per-source endpoints, inventing OAuth routes). Generate client types
> from `http://localhost:8001/openapi.json` while developing; this doc captures the contract
> and the traps.

## 1. Basics

- Base URL: `http://localhost:8001/api/v1` (default; stored in settings, editable)
- Auth: `X-API-Key: <pks_...>` header on all endpoints except `GET /health`
- Rate limit: **100 requests/minute per key** (`X-RateLimit-*` response headers)
- Pagination: `limit` (default 50, max 200) + `offset` (default 0); responses are
  `{ "items": [...], "total": n, "limit": n, "offset": n }`
- Error shape: `{"error": {"code": "...", "message": "...", "details": {}}}`
- The backend is Postgres-based and lives in `../Autocomplete`; the UI never touches its DB.

## 2. Endpoints the UI consumes

### `GET /health` (auth-free)
```json
{ "status": "ok", "version": "0.1.0", "database": "connected", "uptime_seconds": 1234 }
```
Used on the Sources page as a connectivity indicator.

### `GET /connectors` — tier-1 change signal
Params: none (pagination only).
```json
{ "items": [ {
  "id": "uuid", "type": "gmail"|"google_calendar"|"d2l", "name": "My Gmail",
  "status": "active"|"disabled"|"error",
  "last_sync_at": "2026-07-29T09:45:00Z" | null,
  "last_sync_status": "success"|"failed"|"running"|"pending" | null,
  "error_count": 0,
  "config": { "schedule": "*/15 * * * *", "enabled": true },
  "created_at": "...", "updated_at": "..."
} ], "total": 3, "limit": 50, "offset": 0 }
```
**This is the "did anything change?" poll.** Compare `last_sync_at` + `status` +
`last_sync_status` per connector against the local mirror; only reconcile further if moved.

### `GET /snapshots` — the sync surface (tier 2)
Params: `connector_id`, `entity_type` (`email`|`calendar_event`|`assignment`|`grade`),
`external_id`, `limit`, `offset`.

```json
{ "items": [ {
  "id": "uuid", "connector_id": "uuid", "entity_type": "assignment",
  "external_id": "asg-789",
  "data": { ...source-specific payload, see §3... },
  "version": 3,
  "updated_at": "2026-07-30T10:00:00Z"
} ], "total": 8, "limit": 50, "offset": 0 }
```

Ordering: **`updated_at DESC`** (backend `snapshot_repo.py` orders by
`updated_at.desc()`). This ordering + the `updated_at` filter *we* apply client-side is the
incremental-sync mechanism. Snapshots are upserted in place — exactly one row per
`(connector_id, entity_type, external_id)`; `version` increments on each change.

Note: snapshots have **no `user_id`** field (single-user app — irrelevant, but don't look
for it).

### `GET /events` — activity feed (tier 3, display only)
Params: `type`, `source`, `connector_id`, `since`, `until`, `limit`, `offset`.
```json
{ "items": [ {
  "id": "uuid", "source": "gmail", "type": "email.received",
  "timestamp": "2026-07-29T09:30:00Z",
  "payload": { "subject": "...", "sender": "...", "is_read": false },
  "metadata": { "connector_id": "uuid", "external_id": "msg-123",
                "entity_type": "email", "sync_run_id": "uuid" | null },
  "created_at": "..."
} ], "total": 142, "limit": 50, "offset": 0 }
```
Event types: `assignment.created|updated`, `grade.posted`, `email.received|updated`,
`calendar_event.created|updated|deleted`.

### `GET /gmail/messages`, `GET /calendar/events`, `GET /d2l/assignments`, `GET /d2l/grades`
Per-source read endpoints over the normalized snapshot data; params include source-specific
filters (`is_read`, `time_min/time_max`, `course`, `due_before/due_after`). The UI uses the
generic `/snapshots` feed instead of these for sync, but MAY use them for targeted queries
(e.g. "unread emails") — response shapes are the same as snapshot `data` payloads (§3).

### `POST /gmail/sync`, `POST /calendar/sync`, `POST /d2l/sync`
Manual sync trigger; returns `{"sync_run_id": "...", "status": "pending", "message": "..."}`
(202). Used by the "Sync now" button on Sources.

### `GET /connectors/{id}/sync-runs`, `GET /connectors/{id}/health`
Sync-run history + health summary for the Sources page.
`health` → `{ connector_id, status, is_healthy, last_sync_at, last_sync_status,
last_error, error_count, recent_syncs: [ {id, status, started_at, finished_at,
items_collected, events_created} ] }`.

## 3. Snapshot payload shapes (normalized entities)

### assignment (D2L) — `data`
```json
{ "external_id": "asg-789", "course_name": "CS 101", "course_id": "cs-101",
  "title": "Problem Set 3", "due_date": "2026-08-02T23:59:00Z" | null,
  "status": "not submitted"|"submitted"|"overdue"|"not_started",
  "url": null, "description": null }
```
⚠️ **Status vocabulary is inconsistent across the backend docs**
(`domain-models.md`: `"not submitted"|"submitted"|"overdue"`;
`api-specification.md` example: `"not_started"`). Normalize defensively (see
`docs/domain-model.md` §3.1) — never reject an unknown status.

### grade (D2L) — `data`
```json
{ "external_id": "grd-101", "course_name": "CS 101", "assignment_name": "Problem Set 2",
  "score": 45.0 | null, "max_score": 50.0 | null, "percentage": 90.0 | null,
  "feedback": "..." | null, "graded_at": "..." | null }
```

### email (Gmail) — `data`
```json
{ "external_id": "msg-123", "thread_id": "...", "subject": "...", "sender": "...",
  "recipients": [...], "body_text": null, "body_html": null,
  "labels": [...], "is_read": false, "is_starred": false,
  "received_at": "2026-07-29T09:30:00Z" }
```

### calendar_event (Google Calendar) — `data`
```json
{ "external_id": "evt-456", "calendar_id": "...", "title": "Team standup",
  "description": null, "location": "Zoom",
  "start": "2026-07-30T09:00:00Z", "end": "2026-07-30T09:30:00Z",
  "is_all_day": false, "attendees": [...],
  "status": "confirmed"|"tentative"|"cancelled", "recurrence": null }
```
Exclude `status == "cancelled"` events from commitments.

## 4. Critical findings from the backend audit (read before touching sync)

1. **No push/streaming of any kind.** No webhook, SSE, WebSocket, Kafka, Redis, Celery.
   The in-process event bus's only subscriber writes to Postgres. Polling is mandatory.
2. **No log files exist.** Backend logs to stdout only. Do not plan anything that tails files.
3. **`/events?since=` is NOT a safe incremental cursor.** `since` filters on the source
   *event* timestamp, not insertion time. A scrape that ingests an old email inserts a row
   with an old `timestamp` — `since=<watermark>` would silently skip it. Events are also
   ordered by `timestamp DESC`, and PKs are UUIDs (no `BIGSERIAL`/sequence anywhere).
   → Events are **display-only**; never derive state from them.
4. **Snapshots ARE the sync surface**: upserted in place, `version` increments, ordered
   `updated_at DESC`. Reconcile by walking pages and early-exiting at the watermark
   (`docs/sync-engine.md`). No `updated_since` param exists — the early-exit is client-side.
5. **Rate limit 100/min**: a full reconcile across 4 entity types can approach this. Use a
   token bucket (5 req/s burst, 60/min steady) and never run full + tier-2 concurrently.
6. **CORS is misconfigured upstream** (`allow_origins=["*"]` + `allow_credentials=True`).
   Irrelevant to us — Rust makes the calls (no CORS).
7. **Backend has never ingested real data**: no endpoint to store connector credentials
   (connector created via API can't log in) and the dev container lacks a Playwright
   Chromium binary. All 90 backend tests use a synthetic `mock` connector. UI development
   MUST use fixtures (`lib/pks/fixtures.ts`). See `docs/backend-blockers.md`.
8. **Rate-limit + pagination drift**: offset-based pagination under concurrent writes can
   skip/duplicate rows. Mitigated by watermark overlap + version-compare idempotency +
   periodic full reconcile (§5 of sync-engine.md).

## 5. Zod schemas (`src/lib/pks/types.ts`)

Rules:
- Parse EVERY response at the boundary; malformed data → typed error, never a crash.
- Keep schemas structurally loose (`.passthrough()` on `data` payloads) — the backend will
  evolve; unknown fields must not break the UI.
- Dates: parse ISO strings to `Date`; store epoch ms (decision D8).
- The assignment `status` field maps through a normalization function (§3.1 domain-model).

## 6. Fixtures (`src/lib/pks/fixtures.ts`)

`FixtureSyncSource implements SyncSource` returns date-relative data so the demo is always
"alive":

- 3 connectors: `gmail`, `google_calendar`, `d2l` — one with `last_sync_at` 2 min ago,
  one 30 min ago, one failed yesterday.
- ~40 snapshots across entity types, with due dates/start times spread over
  `[today - 5d, today + 14d]`: 8 assignments (mix of statuses incl. one overdue), 6 grades,
  15 emails (5 unread, 2 starred), 11 calendar events (incl. an all-day, a cancelled one).
- An activity feed of ~25 events matching the snapshots.
- The fixture generator takes a `now` parameter (defaults to `Date.now()`) and must be
  deterministic for a given `now` so tests can assert on it.
- Seeds a `dataMode` setting of `fixture`; the Sources page exposes a toggle to `live`
  (requires API key; otherwise shows the setup prompt).

## 7. OpenAPI regeneration

Before major UI work touching types, refresh from the live backend:
```bash
curl -s http://localhost:8001/openapi.json > /tmp/pks-openapi.json
```
Then reconcile `src/lib/pks/types.ts` against the paths in §2. Never trust
`docs/data-product/api/openapi.yaml` (stale: missing `/gmail/*`, `/calendar/*`, `/d2l/*`;
includes unimplemented OAuth routes).
