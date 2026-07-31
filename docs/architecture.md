# Architecture

## 1. System overview

```
┌────────────────────────────────────────────────────────────────┐
│ Tauri v2 desktop app (this repo)                               │
│                                                                │
│  ┌─────────────────────────────┐   invoke    ┌──────────────┐  │
│  │ Webview — React SPA         │────────────▶│ Rust shell   │  │
│  │  • TanStack Router          │  commands   │  • keyring   │  │
│  │  • TanStack Query           │             │  • reqwest   │  │
│  │  • Drizzle (sqlite-proxy)   │◀────────────│  • sqlx pool │  │
│  │  • Sync engine (TS)         │  events/     └──────┬───────┘  │
│  │  • UI kit, dnd-kit, charts  │  returns           │          │
│  └─────────────────────────────┘                    │          │
│                │ SQL via tauri-plugin-sql           │          │
│                ▼                                    ▼          │
│        SQLite file (WAL)                macOS Keychain        │
│        app_config_dir/autocomplete-ui.db      (API key)       │
└────────────────────────────────────────────────────────────────┘
                          │  HTTPS (X-API-Key header)
                          ▼
              PKS FastAPI at http://localhost:8001/api/v1
              (sibling repo ../Autocomplete — never touch its DB)
```

**Design rule: the API key never crosses the webview boundary.**
Vite inlines `VITE_*` variables into the JS bundle, so any secret referenced from the
webview is extractable. Therefore all PKS HTTP calls are made by Rust (`pks_fetch`),
which reads the key from the OS keychain and injects the `X-API-Key` header.

Secondary benefit: requests originate in Rust, so **CORS never applies**. (The PKS backend
currently sets `allow_origins=["*"]` *with* `allow_credentials=True`, which is invalid per
spec — routing through Rust sidesteps that entirely.)

## 2. Process / threading model

- **Rust**: one Tokio runtime. Holds a long-lived `sqlx::SqlitePool` (max 4 connections).
  Commands are async and do not block the UI. No background threads of our own — the sync
  loop lives in TypeScript (decision D3).
- **Webview**: the sync engine runs on `setInterval`-style loops within the JS process.
  While the app window is open, sync runs. Closing the app stops sync — acceptable for a
  personal dashboard (documented decision D3).
- **SQLite concurrency**: WAL mode (`PRAGMA journal_mode=WAL`, plus
  `PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000`) set by the Rust pool on init. WAL
  allows the plugin pool (webview reads/writes) and the Rust pool (sql_batch) to coexist.

## 3. Directory layout (target, complete)

```
.
├── AGENTS.md                 # agent instructions (git workflow, commands)
├── docs/                     # THIS project's docs (data-product/ is frozen, external)
├── drizzle.config.ts         # drizzle-kit config (dialect sqlite, out src/db/migrations)
├── package.json
├── vite.config.ts            # react, tailwind, TanStackRouterVite plugins; port 1420
├── index.html
├── src/
│   ├── main.tsx              # bootstrap: runMigrations() → render
│   ├── routes.tsx            # route tree (TanStack Router file-based generates this)
│   ├── routes/
│   │   ├── __root.tsx        # layout: sidebar + <Outlet/>
│   │   ├── index.tsx         # Dashboard
│   │   ├── kanban.tsx
│   │   ├── week.tsx
│   │   ├── insights.tsx
│   │   ├── sources.tsx
│   │   ├── settings.tsx
│   │   └── setup.tsx         # first-run: API key + base URL (shown when !hasApiKey && live mode)
│   ├── db/
│   │   ├── schema.ts         # Drizzle tables (THE schema — see docs/database-schema.md)
│   │   ├── client.ts         # drizzle sqlite-proxy wiring
│   │   ├── migrate.ts        # import.meta.glob migration runner
│   │   ├── migrations/       # drizzle-kit generated .sql files (committed)
│   │   └── repo/             # repository layer — ONLY code that touches tables
│   │       ├── connectors.repo.ts
│   │       ├── mirror.repo.ts
│   │       ├── tasks.repo.ts
│   │       ├── activity.repo.ts
│   │       ├── sync-state.repo.ts
│   │       └── settings.repo.ts
│   ├── lib/
│   │   ├── pks/
│   │   │   ├── types.ts      # Zod schemas matching live /openapi.json
│   │   │   ├── client.ts     # fetch wrapper over invoke('pks_fetch')
│   │   │   └── fixtures.ts   # date-relative mock data (default dataMode)
│   │   ├── sync/
│   │   │   ├── engine.ts     # orchestrator (tiers + full reconcile + manual)
│   │   │   ├── sources.ts    # SyncSource/SyncSink interfaces + impls
│   │   │   ├── reconcile.ts  # watermark walk w/ early exit
│   │   │   ├── activity.ts   # tier-3 events feed
│   │   │   └── derive.ts     # mirror → tasks/commitments/signals
│   │   ├── schedule/
│   │   │   ├── capacity.ts   # per-day capacity, backward fill
│   │   │   ├── effort.ts     # heuristics + defaults
│   │   │   └── rank.ts       # explainable ranking
│   │   └── time.ts           # epoch-ms helpers, local-tz day/week bucketing
│   ├── components/           # UI kit + feature components (see docs/ui.md)
│   └── styles.css            # tailwind entry
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json       # identifier com.autocomplete-ui.app, frontendDist ../dist
    ├── capabilities/default.json
    ├── icons/                # from template
    └── src/
        ├── main.rs
        ├── lib.rs            # commands + state + setup
        └── pks.rs            # keyring helpers, pks_fetch, sql_batch impl
```

## 4. Rust commands — exact contract

All commands live behind `#[tauri::command]` in `src-tauri/src/lib.rs` (or `pks.rs`).
Error contract: return `Result<T, String>` with a human-readable message; the webview maps
them to `PksError`/`DbError` (see `src/lib/pks/client.ts`).

### `has_api_key() -> Result<bool, String>`
Reads keyring entry `service = "com.autocomplete-ui.app"`, `account = "pks-api-key"`.
Result is cached in `Mutex<Option<String>>` state to avoid keychain round-trips.

### `set_api_key(key: String) -> Result<(), String>`
Writes to keyring, updates cache. Rejects empty/whitespace keys.

### `pks_fetch(base_url: String, path: String, query: HashMap<String, String>) -> Result<Value, String>`
1. Reads the key from keyring/cache; missing key → error `"No API key configured"`.
2. `GET {base_url trimmed of trailing /}{path}?{query}` via `reqwest::Client`
   with header `X-API-Key: <key>`, `User-Agent: autocomplete-ui/0.1.0`.
3. Response:
   - 2xx → return `response.json::<serde_json::Value>()` (parse error → error string).
   - 4xx/5xx → error string including HTTP status and the PKS error body
     (PKS shape: `{"error": {"code": ..., "message": ..., "details": {}}}`).
   - Network/connect → error string; do **not** panic; do **not** retry here
     (retries are the engine's job).
Note: the webview supplies `base_url` from the settings table (default
`http://localhost:8001/api/v1`). Rust never persists it; keyring only stores the key.

### `sql_batch(statements: Vec<BatchStmt>) -> Result<BatchResult, String>`
Executes statements **in one transaction** on the Rust-owned sqlx pool.

```rust
struct BatchStmt { sql: String, params: Vec<serde_json::Value> }
struct BatchResult { rows_affected: u64 }
```

Param mapping (serde_json::Value → sqlx Sqlite):
- `Null` → SQL NULL
- `Bool` → integer 0/1
- `Number` (i64) → INTEGER; (f64) → REAL
- `String` → TEXT

Returns `rows_affected` summed across statements. Used by the sync engine to write mirror
pages atomically (Drizzle's `db.transaction()` is NOT supported by `sqlite-proxy`; per-query
`Database.load()+close()` is pathologically slow — see `docs/sync-engine.md` §7).

## 5. Frontend data flow

- `main.tsx`: `await runMigrations()` → `render(<Root/>)`.
- Root: TanStack Router; `__root.tsx` renders sidebar + `<Outlet/>`; sidebar links use
  `Link` from the router.
- Data: TanStack Query with a `syncEvents` invalidation bus — the engine publishes
  `{type: 'connectors'|'mirror'|'activity'|'tasks'}`, the QueryClient invalidates matching
  keys. Polling is engine-driven, NOT Query-driven (`refetchInterval` is off; the engine
  owns the cadence).
- All PKS responses pass through Zod (`lib/pks/types.ts`) before touching state.

## 6. Tauri configuration specifics

`src-tauri/tauri.conf.json`:
- `identifier`: `com.autocomplete-ui.app` — must match the keyring service constant
- `productName`: `Autocomplete UI`
- `build.beforeDevCommand`: `npm run dev`; `devUrl`: `http://localhost:1420`;
  `beforeBuildCommand`: `npm run build`; `frontendDist`: `../dist`
- `app.windows[0]`: title `Autocomplete UI`, 1280×800, minWidth 960, minHeight 600
- `app.security.csp`: `null` for now (local-only app; revisit before shipping)
- `plugins.sql.preload`: `["sqlite:autocomplete-ui.db"]`

`capabilities/default.json` permissions: `["core:default", "sql:default"]`
(app-defined commands need no capability entries).

DB path resolution: plugin resolves `sqlite:<name>` relative to `app_config_dir()` →
`~/Library/Application Support/com.autocomplete-ui.app/autocomplete-ui.db` on macOS.
The Rust sqlx pool must open the **same absolute path** (via `app.path().app_config_dir()`).

## 7. Security notes

- API key: OS keychain only (`keyring` v3, feature `apple-native`). Never logged, never in
  the bundle, never sent to the webview after entry. Entry/update happens once in the setup
  screen; the field is cleared on blur.
- CORS: irrelevant (Rust makes the calls).
- CSP: currently `null` — harden (allow only `'self'` + needed tauri schemes) before any
  public release; note as a task in the final polish phase.
- No remote code: all JS ships with the app; no eval.
