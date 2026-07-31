# autocomplete-ui — Master Plan

> **Status: IN PROGRESS — Phase 1**
>
> This document is the single source of truth for what this project builds and how.
> Other docs in this directory expand on specific areas. Read `docs/README.md` for the index.

---

## 1. What this app is

`autocomplete-ui` is a local desktop dashboard for one person (the user). It consumes the
**Personal Knowledge Stream (PKS) data product** — a FastAPI backend in the sibling repo
`../Autocomplete` (running at `http://localhost:8001`) — which scrapes the user's Gmail,
Google Calendar, and D2L/Brightspace.

The app answers, in one beautiful place:

- **What do I need to work on next?** (ranked, explainable)
- **What's going on?** (calendar commitments, emails, grades, recent activity)
- **How busy am I this week?** (capacity vs committed time vs task load, per day)
- **How is my work organized?** (Kanban board, drag-and-drop)
- **Where does my time go?** (task/effort distribution, due histogram, throughput, grade trends)

It is **not** a task manager that replaces D2L/Google — those remain sources of truth. The app
mirrors their data locally and adds a personal planning layer on top.

## 2. Non-goals (explicit)

- **No push/streaming from the backend.** The PKS API has no webhook/SSE/WebSocket/Kafka
  and cannot get one without major backend work. The app polls (see `docs/sync-engine.md`).
- **No server of any kind.** Everything runs locally inside a Tauri desktop app.
- **No multi-user.** Single user, single machine.
- **No direct database access to PKS.** The app only talks to the PKS HTTP API.
- **No editing of `docs/data-product/`.** It is a frozen copy of `../Autocomplete/docs/`.

## 3. Tech stack (decided, do not change)

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Tauri v2** (Rust) | Small binary, low memory, system keychain, tray/native notifications |
| Frontend | **Vite + React 19 + TypeScript** | Static SPA — Tauri cannot run a server; Vite makes Drizzle migrations embeddable (`import.meta.glob`) |
| Router | **TanStack Router** (file-based) | Typed, file-convention routes |
| Server state | **TanStack Query** | Polling-native, caching, optimistic updates |
| Database | **SQLite** via `tauri-plugin-sql` (sqlx), WAL mode | Fast, zero-config, local |
| ORM | **Drizzle + `drizzle-orm/sqlite-proxy`** | Type-safe queries; a thin repo layer keeps the Postgres-swap possible later |
| Secrets | **`keyring` crate v3** (Rust only, `apple-native` feature) | OS keychain; the API key never enters the webview |
| UI | **Tailwind CSS v4 + hand-rolled component kit** (no shadcn CLI) | Lightweight, full control, no tooling risk |
| Kanban DnD | **@dnd-kit** | Standard, accessible |
| Charts | **Recharts** | Declarative, good enough for dashboards |
| Validation | **Zod** | Every PKS response parsed at the boundary |
| Tests | **Vitest** (pure-logic only) | Sync/capacity/derive logic must be unit-tested |

### Why not Next.js

Tauri requires `output: 'export'` (static). That disables Server Actions, Route Handlers that
read `Request`, middleware, cookies, redirects, rewrites, ISR, image optimization — the exact
features Next.js is chosen for. Also, Drizzle's webview migration pattern depends on Vite's
`import.meta.glob`, which Next (webpack/turbopack) does not provide. Decision made with user;
see `docs/architecture.md`.

### Why not Kafka / why polling

The PKS backend's "event bus" is an in-process asyncio handler dict whose only production
subscriber writes a row to Postgres. There is no external producer, no queue, no push API
(grepped `src/` in `../Autocomplete`: zero webhook/SSE/WebSocket/Kafka code). Product spec
itself states "Polling over webhooks — Playwright cannot receive push notifications." Kafka
would add a broker for a single user with nothing on the other end. **The app polls.**
Full analysis: `docs/api-contract.md`.

## 4. Repository and branch workflow

- Branches: `main` (stable), `dev` (integration — all feature PRs target this), `prod` (release)
- Every task = one feature branch (`feat/<task>`) + one PR into `dev`, opened via `gh`
- PRs are **reviewed by the user**; do not merge them yourself
- Stacked PRs: when a feature branch depends on an unmerged one, branch from the unmerged
  branch and set the PR base accordingly. Full rules: `docs/contributing.md`

## 5. Phases and acceptance criteria

### Phase 1 — Shell and data layer (PRs 2–3)

- [x] PR #1: docs + AGENTS.md (this document set)
- [ ] PR #2 `feat/scaffold`: Tauri + Vite + React + TS + Tailwind + TanStack Router shell;
      sidebar layout with placeholder views for all 6 pages; vitest wired; `npm run build`,
      `npm run typecheck`, `npm test`, `cargo check` all green
- [ ] PR #3 `feat/data-layer` (base: `feat/scaffold`):
  - Drizzle schema for all tables (`docs/database-schema.md`) + `drizzle-kit generate` migration
  - Migration runner using `import.meta.glob` + `__drizzle_migrations` table
  - Rust commands: `set_api_key`, `has_api_key`, `pks_fetch`, `sql_batch` (`docs/architecture.md`)
  - PKS client: Zod types generated from the **live** `http://localhost:8001/openapi.json`
    (NOT from the stale `docs/data-product/api/openapi.yaml`)
  - Fixture dataset (`fixtures.ts`) that produces realistic, date-relative data
  - Settings page: API key + base URL entry (key → keyring only)
  - DB bootstrapped before app render; setup screen shown when no key in `fixture` mode? No —
    fixture mode is the default so the app is fully usable with zero setup

### Phase 2 — Sync engine (PR #4)

- [ ] PR #4 `feat/sync-engine` (base: `feat/data-layer`):
  - Repository layer over Drizzle (all reads/writes go through `src/db/repo/*`)
  - `SyncSource`/`SyncSink` interfaces + `ReconcileSyncSource` (live) + `FixtureSyncSource`
  - Three-tier engine: change signal → snapshot reconcile (early-exit) → activity feed
  - Watermark persistence in `sync_state`, 60s overlap, version-compare upserts, tombstones
  - Full reconcile on launch + daily; manual "Sync now" per connector
  - `derive.ts`: mirror → tasks/commitments/signals (`docs/domain-model.md`)
  - Sources page functional: connector health, last sync, sync now
  - Unit tests: watermark walk, upsert skip logic, derivation mapping

### Phase 3 — Planning layer (PR #5)

- [ ] PR #5 `feat/planning` (base: `feat/sync-engine`):
  - Capacity profile (per-weekday hours) editable in Settings
  - Effort heuristics + per-task inline editing + course defaults (`docs/capacity-engine.md`)
  - Backward-fill scheduler + per-day load; at-risk detection
  - Ranking with "why" explanation
  - Dashboard view (today's focus, at-risk, week bars)

### Phase 4 — Interaction (PR #6)

- [ ] PR #6 `feat/kanban` (base: `feat/planning`):
  - Kanban board (Backlog / Next / In Progress / Blocked / Done) with dnd-kit
  - Task creation (manual), email promotion, inline effort/priority editing
  - Override policy: user-set fields survive re-sync (`docs/domain-model.md`)

### Phase 5 — Insights and polish (PR #7)

- [ ] PR #7 `feat/insights` (base: `feat/kanban`):
  - Week timeline (commitments + scheduled task blocks)
  - Insights: distribution by course & priority, 14-day due histogram, weekly throughput,
    grade trend per course (Recharts)
  - Tray icon + native notifications (due soon / sync errors)
  - Dark mode toggle

### Phase 6 — Live cutover (blocked on backend)

- [ ] Backend blockers fixed in `../Autocomplete` (`docs/backend-blockers.md`):
      credentials storage endpoint + Playwright Chromium in dev container
- [ ] Flip `dataMode` to `live`; end-to-end validation with real data

## 6. Decision log

| # | Decision | Rationale |
|---|---|---|
| D1 | Poll instead of Kafka/push | No push exists in PKS; polling is correct for single-user (user approved) |
| D2 | Vite+React instead of Next.js | Static export strips Next's value; Tauri's Drizzle pattern needs Vite (`import.meta.glob`) |
| D3 | Sync engine in TypeScript; Rust = thin shell | One language for all app logic; cleanest future Postgres swap (user approved) |
| D4 | No backend cursor fix; work around `/events` | Snapshot-reconcile with early exit is correct today, self-healing, zero backend changes (user approved) |
| D5 | Heuristic effort defaults, user-overridable | Explainable, offline, self-refining (user approved) |
| D6 | API key lives in OS keychain, never in webview | Vite inlines env vars into the bundle; keyring is the standard answer |
| D7 | Single `mirror_entities` table instead of one per entity type | Uniform repo code, simpler migration; typed access via repo layer |
| D8 | Timestamps as UTC epoch ms integers | SQLite+JS friendly; local tz only at render |
| D9 | Repo-local git identity `TS-24 <121516200+TS-24@users.noreply.github.com>` | Links commits to the GitHub account without touching global config |

## 7. Current status

- [x] Backend audited; live API confirmed at `http://localhost:8001/api/v1` (see `docs/api-contract.md`)
- [x] Docs written (PR #1)
- [ ] Phases 1–5 in progress via stacked PRs (see section 5)
