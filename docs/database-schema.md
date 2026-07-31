# Database Schema (SQLite via Drizzle)

The single source of truth is `src/db/schema.ts`. Every table is defined there with
`sqliteTable`; every query in the app goes through `src/db/repo/*` — components never issue
Drizzle queries directly.

## 1. Conventions (decision D7, D8)

- **Timestamps**: `integer('x', { mode: 'timestamp_ms' })` — UTC epoch milliseconds.
  Local-timezone bucketing happens only at render (`lib/time.ts`).
- **IDs**: `text('id').primaryKey()` — UI-generated UUIDs (crypto.randomUUID) for local
  rows; upstream UUID strings for mirrored rows.
- **JSON**: `text('col', { mode: 'json' })` — SQLite has no native JSON type; this is
  stored as TEXT and parsed by Drizzle. (Portability note: Postgres would use `jsonb`.)
- **Enums**: plain `text` + TS union types; no CHECK constraints (portability).
- **Booleans**: SQLite stores as 0/1 integers; Drizzle `integer('x', { mode: 'boolean' })`.
- Two ownership classes (see §2) — mirror rows are written ONLY by the sync engine, local
  rows ONLY by user actions. This separation is what lets user edits survive re-sync.

## 2. Ownership

| Table | Class | Writer | Notes |
|---|---|---|---|
| `connectors` | mirror | sync engine | copy of `GET /connectors` |
| `mirror_entities` | mirror | sync engine | snapshots of all 4 entity types |
| `activity_events` | mirror | sync engine | display-only event feed |
| `tasks` | local | user + derive | derive() creates, user edits; overrides column pins user fields |
| `sync_state` | local | sync engine (internal) | watermarks; engine-internal but user-data-free |
| `settings` | local | user / engine | key-value, JSON values |
| `capacity_profile` | local | user (seeded defaults) | per-weekday hours |

## 3. Table definitions (exact)

### `connectors` — mirror of `GET /connectors`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | upstream UUID |
| `type` | text notNull | `gmail` \| `google_calendar` \| `d2l` (any unknown → passthrough) |
| `name` | text notNull | |
| `status` | text notNull | `active` \| `disabled` \| `error` |
| `lastSyncAt` | timestamp_ms | nullable |
| `lastSyncStatus` | text | nullable |
| `errorCount` | integer notNull default 0 | |
| `updatedAt` | timestamp_ms notNull | upstream `updated_at` |
| `deletedAt` | timestamp_ms | local tombstone (row removed upstream) |
| `syncedAt` | timestamp_ms notNull | our last write time (engine bookkeeping) |

Index: `idx_connectors_status` on `status`.

### `mirror_entities` — the sync surface (decision D7: one table for all entity types)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UI-generated UUID (not upstream snapshot id — that is not stable per entity) |
| `connectorId` | text notNull | upstream connector UUID |
| `entityType` | text notNull | `email` \| `calendar_event` \| `assignment` \| `grade` |
| `externalId` | text notNull | upstream external id |
| `payload` | text json notNull | the snapshot `data` object, as-is |
| `version` | integer notNull | upstream `version`; 0 for fixture rows |
| `updatedAt` | timestamp_ms notNull | upstream `updated_at` |
| `createdAt` | timestamp_ms notNull | our insert time |
| `deletedAt` | timestamp_ms | tombstone (see sync-engine §5) |

Constraints/indexes:
- `UNIQUE (connectorId, entityType, externalId)` — unique index `mirror_entities_uniq`
- `idx_mirror_entity_type` on `entityType`
- `idx_mirror_updated` on `updatedAt` (early-exit walk)

### `activity_events` — tier-3 feed (display only)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | upstream event UUID (stable) |
| `source` | text notNull | |
| `type` | text notNull | event type string |
| `timestamp` | timestamp_ms notNull | upstream `timestamp` |
| `payload` | text json | nullable |
| `createdAt` | timestamp_ms notNull | upstream `created_at` (for the trailing window) |

Index: `idx_activity_created` on `createdAt`.

### `tasks` — user planning layer

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UI UUID |
| `title` | text notNull | |
| `description` | text | |
| `originKind` | text | `assignment` \| `email` \| `manual` (null = manual) |
| `originExternalId` | text | links to `mirror_entities.externalId` (+ connector/entity type via `originConnectorId`, `originEntityType` below) |
| `originConnectorId` | text | |
| `originEntityType` | text | |
| `status` | text notNull default `'backlog'` | `backlog` \| `next` \| `in_progress` \| `blocked` \| `done` |
| `priority` | integer notNull default 0 | 0–4 (user), higher = more important; -1 = unset/auto |
| `effortMinutes` | integer | nullable; null → use heuristic (`docs/capacity-engine.md`) |
| `dueAt` | timestamp_ms | nullable |
| `course` | text | display grouping |
| `source` | text | `d2l` \| `gmail` \| `manual` |
| `overrides` | text json notNull default `{}` | set of pinned fields, e.g. `{"status":true,"priority":true}` |
| `completedAt` | timestamp_ms | |
| `createdAt` / `updatedAt` | timestamp_ms notNull | |
| `archivedAt` | timestamp_ms | soft archive (not shown in kanban) |

Indexes: `idx_tasks_status` on `status`; `idx_tasks_due` on `dueAt`;
`idx_tasks_origin` on `(originEntityType, originExternalId)`.

### `sync_state` — watermarks (engine bookkeeping)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `${connectorId}:${entityType}` |
| `connectorId` | text notNull | |
| `entityType` | text notNull | |
| `watermark` | timestamp_ms notNull default 0 | highest `updated_at` fully processed |
| `lastFullReconcileAt` | timestamp_ms | |
| `updatedAt` | timestamp_ms notNull | |

### `settings` — key-value (JSON values)

| Column | Type | Notes |
|---|---|---|
| `key` | text PK | see §4 for reserved keys |
| `value` | text json notNull | |

### `capacity_profile` — per-weekday hours (0 = Sunday … 6 = Saturday)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `mon`, `tue`, ... or `0..6` — pick `mon|tue|wed|thu|fri|sat|sun` |
| `hours` | real notNull | default 4 on weekdays, 0 weekend |

Seed on first run: `{mon:4, tue:4, wed:4, thu:4, fri:4, sat:0, sun:0}`.

## 4. Reserved settings keys

| Key | Value shape | Default |
|---|---|---|
| `pksBaseUrl` | string | `http://localhost:8001/api/v1` |
| `dataMode` | `"fixture"` \| `"live"` | `"fixture"` |
| `effortDefaults` | `{ assignment: 180, email: 15 }` (minutes) | above |
| `effortCourseOverrides` | `{ "CS 101": 120, ... }` | `{}` |
| `notificationsEnabled` | bool | true |

## 5. Migration workflow

1. Edit `src/db/schema.ts`.
2. `npx drizzle-kit generate` → writes a timestamped `.sql` file to
   `src/db/migrations/`. **Commit the generated SQL.**
3. At runtime, `src/db/migrate.ts` applies pending migrations:
   - Inlines all `.sql` at build time: `import.meta.glob('./migrations/*.sql', { eager: true, query: 'raw', import: 'default' })`
   - Ensures `__drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL UNIQUE, created_at INTEGER)`
   - Splits each file on the `--> statement-breakpoint` marker (Drizzle's statement separator)
   - Executes each statement via the plugin connection; records `sha256(sql)` once the file succeeds
4. `main.tsx` awaits `runMigrations()` before rendering.
5. **Never** change an already-committed migration file — add a new one (rollout discipline).

## 6. Repo layer rules (`src/db/repo/*`)

- Every repo exports small async functions (`listConnectors`, `upsertConnector`, ...).
- Repos are the ONLY modules allowed to import from `../schema` and `../client`.
- SQLite-proxy caveats (why repos exist): `db.transaction()` is unsupported — multi-statement
  writes must go through `sql_batch` (Rust) or be sequentially idempotent. `select` returns
  array-of-arrays; the client translates.
- Portability: keep WHERE/JOINs to common SQL; the day a Postgres swap happens, only
  `schema.ts`, `client.ts`, `migrate.ts` change — repos keep their API.

## 7. Postgres-swap path (future, documented not built)

1. `sqliteTable` → `pgTable` (schema.ts), JSON text → `jsonb`, migration runner → drizzle
   `migrate` against `pg-proxy` or a sidecar. 2. `client.ts` → `drizzle-orm/pg-proxy` over a
   `sql_batch`-equivalent. 3. Rust `sql_batch` → postgres pool. All query code (repos,
   engine, UI) stays identical.
