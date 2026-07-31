# UI Specification

## 1. Layout

- **Sidebar** (left, ~220px, `zinc-950`-style dark, always visible): app name, nav links,
  connector status dots at bottom (from `['sources']` query), "Sync now" affordance.
- **Main content**: top header (page title + subtitle, contextual actions), scrollable body.
- Dark theme by default (dashboard apps look best dark); toggle in Settings.
- All pages must handle states: **loading** (skeleton), **empty** (friendly empty state
  with a CTA), **error** (message + retry), **fixture mode badge** ("Demo data — connect
  the backend in Settings") in the header when `dataMode == 'fixture'`.

Design tokens (Tailwind v4 `@theme` in `styles.css`):
- Accent: `indigo-500`; danger `rose-500`; warn `amber-500`; ok `emerald-500`
- Surfaces: `zinc-950` bg, `zinc-900` cards, `zinc-800` hover, `zinc-400` secondary text,
  `zinc-100` primary text
- Radius: `rounded-lg` cards, `rounded-md` buttons/inputs; soft shadows
- Font: system stack (`-apple-system, ...`); tabular-nums for numbers

## 2. Routes (TanStack Router, file-based in `src/routes/`)

| Path | File | Title |
|---|---|---|
| `/` | `index.tsx` | Dashboard |
| `/kanban` | `kanban.tsx` | Kanban |
| `/week` | `week.tsx` | Week |
| `/insights` | `insights.tsx` | Insights |
| `/sources` | `sources.tsx` | Sources |
| `/settings` | `settings.tsx` | Settings |

`__root.tsx`: sidebar + `<Outlet/>`; wrap app in QueryClientProvider; wire engine
`subscribe` → query invalidation (§6 of sync-engine.md). A `SetupGate` renders the setup
screen instead of the outlet when `dataMode == 'live' && !hasApiKey`.

## 3. View specs

### Dashboard (`/`)
- **"Work on this next"** — top-5 `rankTasks()` rows: title, course chip, due-relative
  label, effort, `why` chips (max 3). Click → opens task in Kanban (link to `/kanban`).
- **At-risk panel** — tasks flagged at-risk by the scheduler; red border, "due X, won't
  fit" copy.
- **This week** — 7 day bars (Mon..Sun): capacity track + committed segment + task-load
  segment; color rule from capacity-engine §3; bar for today highlighted; busy% label.
- **Recent activity** — last 8 `activity_events` (icon per source, relative time).
- **Today's commitments** — calendar blocks for today from `listCommitments(today)`.

### Kanban (`/kanban`)
- 5 columns: Backlog, Next, In Progress, Blocked, Done. Column headers show counts.
- Cards: title, course chip, due chip (red when overdue), effort, priority dots (0–4),
  origin badge (D2L / Gmail / manual). Drag with **@dnd-kit** (DndContext + SortableContext
  per column; pointer sensor, 6px activation distance).
- Drop: optimistic update (`useMutation` + `setQueryData`), then write
  `status` + `overrides.status` via tasks repo; rollback on error.
- Card actions: priority stepper, effort edit (inline number w/ unit "h"), "Mark done",
  archive. "New task" button per column (manual task modal: title, course, due, effort,
  priority).
- Inbox strip at top: unread emails (max 10) with "→ Task" promote button
  (domain-model §2.4).

### Week (`/week`)
- 7-day grid, time axis 06:00–23:00 (local). Commitments as blocks (indigo); scheduled
  task blocks from the scheduler (slate/emerald with effort label); at-risk tasks ghosted
  at the top of their due day with a warning chip.
- Day column shows busy% header. Clicking a block shows a small popover with details.

### Insights (`/insights`)
- Charts (Recharts):
  - Donut: task distribution by course
  - Bar: distribution by priority (0–4)
  - Histogram: tasks due per day, next 14 days (stacked by status)
  - Line: weekly throughput (tasks → done per week, last 8 weeks)
  - Line: grade trend per course (`graded_at` x, `percentage` y)
- Stat cards row: open tasks, done this week, at-risk count, committed hours this week.

### Sources (`/sources`)
- Per-connector card: name, type icon, status pill, last sync + result, error count,
  "Sync now" (POST via source; disabled while running; optimistic spinner).
- Health summary (from `GET /connectors/{id}/health` in live mode; fixtures emulate).
- Data mode toggle: `fixture` ↔ `live` (live requires key; shows inline setup prompt).
- Backend connectivity indicator (`GET /health`).

### Settings (`/settings`)
- **Connection**: base URL, API key field (password input; on save → `set_api_key`,
  clears field; shows "stored in macOS Keychain"), "test connection" button (calls
  `GET /health` via `pks_fetch`), data-mode select.
- **Capacity**: 7 row inputs (Mon..Sun hours) saved to `capacity_profile`.
- **Effort defaults**: per-source minutes + per-course overrides table (add/remove rows).
- **Notifications**: toggle (stored in settings; used by tray notifications later).
- **Data**: "Reset local data" (danger zone: wipes mirror + tasks, keeps settings/key —
  confirm dialog).

## 4. Component kit (`src/components/ui/`, hand-rolled — no shadcn)

Small, cva-free, typed props, dark-theme defaults:

`Button` (variants: primary/secondary/ghost/danger; sizes sm/md/icon) · `Card` (+ CardHeader/
Title/Content) · `Badge` (tone: default/ok/warn/danger/accent) · `Progress` · `Dialog`
(portal, focus trap, Esc/overlay close) · `Input`/`Select`/`Switch`/`Textarea` ·
`Skeleton` · `EmptyState` (icon, title, body, CTA) · `Tooltip` (CSS-only, title attr fallback
is acceptable) · `StatCard` (label, value, delta) · `ConfirmDialog`.

Feature components: `Sidebar`, `WeekBars`, `RankedTasks`, `KanbanBoard`, `KanbanColumn`,
`TaskCard`, `WeekGrid`, `ActivityFeed`, `ConnectorCard`, `InsightChart` (chart config per
metric), `SetupGate`, `FixturesBadge`.

## 5. Data wiring (TanStack Query keys)

```
['settings']          – settings repo (rarely invalidated)
['connectors']        – connectors mirror
['mirror', entityType]– mirror_entities filtered (email/assignment/grade/calendar_event)
['tasks']             – tasks + derived
['capacity']          – schedule results (load, flags) — invalidated on tasks/commitments/settings change
['activity']          – activity_events
['sources']           – health / sync status
```

Mutations: kanban move, task create/edit, effort/priority/due edits, sync now,
settings saves — all `useMutation` + `invalidateQueries`. Optimistic where latency matters
(kanban).

## 6. Styling

Tailwind v4 (`@import "tailwindcss"` + `@theme` tokens + `@custom-variant dark` if a toggle
is added; default dark via class on `<html>`). No UI framework runtime. Charts use
Recharts default theme with the token palette. Icons: `lucide-react` (small, tree-shaken).
