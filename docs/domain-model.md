# Domain Model

The PKS API has no concept of a task, priority, or effort. The planning layer is this app's
own value-add, derived from the mirror and layered over it.

## 1. Concepts

| Concept | What it is | Source | UI treatment |
|---|---|---|---|
| **Task** | an actionable unit of work | derived from `assignment` snapshots; manually created; emails *promoted* by the user | Kanban card; has status, priority, effort |
| **Commitment** | a time-blocking event | `calendar_event` snapshots (status ≠ `cancelled`) | Week timeline + capacity consumption; never a kanban card |
| **Signal** | something worth noticing, not necessarily actionable | `grade` snapshots; unpromoted `email` snapshots | Insights + Sources lists; email triage ("promote to task") |
| **Activity** | a recent change | `/events` (tier 3) | "What changed recently" list |

## 2. Derivation rules (`src/lib/sync/derive.ts`)

`deriveAll()` reads the mirror and upserts `tasks`. **Idempotent**: same mirror in →
same tasks out (modulo `createdAt` on new rows). Never deletes a task a user touched —
rules below.

### 2.1 Assignment → task

For each `mirror_entities` row where `entityType == 'assignment'` and `deletedAt IS NULL`:

| upstream `data.status` | → task `status` | notes |
|---|---|---|
| `submitted` | `done` (if no later user override) | |
| `overdue` | `blocked` | flagged in dashboard as at-risk/overdue |
| `not submitted`, `not_started`, `started`, anything else | `backlog` — or `next` if due within 48h | see normalization in §3.1 |

- `title` = `data.title`; `description` = `data.description`; `course` = `data.course_name`
- `dueAt` = `data.due_date` (epoch ms); `source = 'd2l'`
- `originKind = 'assignment'`, `originExternalId = data.external_id`,
  `originConnectorId = <row.connectorId>`, `originEntityType = 'assignment'`
- **Re-derivation updates mirrored fields (title, dueAt, course) but NEVER fields present
  in `tasks.overrides`** (§4).

### 2.2 Grade → signal (no task)

Grades do not create tasks. They feed:
- `courseGradeWeight[course]` = normalized `(score/max_score)` used by the ranker's
  "importance" term (`docs/capacity-engine.md` §4).
- the Insights grade trend (line per course over time).

### 2.3 Calendar event → commitment (no task)

Commitments are computed on demand from the mirror (`listCommitments(from, to)` repo
query), not stored. Exclude `status == 'cancelled'` and rows where `end <= start` (guard).

### 2.4 Email → signal + optional promotion

- Emails are signals; the Sources/Inbox list shows them with a "→ Task" action.
- Promotion creates a task:
  - `title` = email subject; `description` = sender + snippet (first 140 chars of body)
  - `dueAt` = null (user sets); `source = 'gmail'`; `originKind = 'email'`,
    `originExternalId = external_id`
  - promotion is recorded in `overrides = {"promoted": true}` — re-derivation never
    auto-creates tasks from emails, so promotion is the only path and is permanent.
- De-promotion: deleting a promoted task does NOT touch the email; the email returns to
  signal status.

### 2.5 Manual tasks

`originKind = 'manual'`, no origin links. Re-derivation ignores them.

### 2.6 Mirror row deleted/tombstoned upstream

- If the mirror row has `deletedAt` set (tombstone from full reconcile): the derived task
  gets `archivedAt = now` — NOT deleted (user data preserved). A resurrected upstream row
  (deletedAt cleared) un-archives the task.

## 3. Normalization

### 3.1 Assignment status vocabulary (backend inconsistency)

Map defensively — unknown values pass through as `backlog`:

```ts
const ASSIGNMENT_STATUS: Record<string, TaskStatus> = {
  'submitted': 'done', 'completed': 'done', 'graded': 'done',
  'overdue': 'blocked', 'late': 'blocked',
  'not submitted': 'backlog', 'not_started': 'backlog', 'started': 'in_progress',
}
```

### 3.2 Timezones

All stored times are UTC epoch ms. "Today", "this week", "due within 48h" are computed in
the local timezone (`lib/time.ts`: `startOfDay(t)`, `addDays`, `weekBounds(now)`).

## 4. Override policy (surviving re-sync)

`tasks.overrides` is a JSON set of pinned field names, e.g.
`{"status": true, "priority": true, "effortMinutes": true, "dueAt": true}`.

- The **kanban drag**, the **priority editor**, the **effort editor**, and the **due-date
  editor** always add the touched field to `overrides` before writing.
- `deriveAll()` updates a task's mirrored fields only if NOT in `overrides`:
  - `title`/`description`/`course`/`dueAt` from the assignment — unless pinned.
  - `status` — unless pinned (a user who moved a card keeps it there; the card shows an
    "upstream says: overdue" hint badge instead).
- `priority` and `effortMinutes` are user-owned; derivation never writes them.

## 5. Task lifecycle

```
backlog → next → in_progress → done     (drag / arrows)
            ↘ blocked ⇄ in_progress      (drag; also set by overdue derivation when unpinned)
done: sets completedAt (first time), keeps effort for throughput stats
blocked: never auto-unblocked; user must move it
archived: archivedAt set (auto on upstream tombstone, or user "archive")
```

- `done` + `archivedAt` are excluded from kanban.
- Weekly throughput counts tasks entering `done` per week (Insights).
