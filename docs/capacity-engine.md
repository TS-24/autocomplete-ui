# Capacity Engine

Answers "how busy am I this week", "what should I work on next", and "what's at risk" from
three inputs: tasks (effort + due), commitments (calendar blocks), capacity (per-weekday
hours).

All functions live in `src/lib/schedule/` and are **pure** (inputs in, results out) so they
are unit-testable without a database. Data is passed in by the caller (TanStack Query
selectors or repo calls), never fetched inside these modules.

## 1. Inputs

- `tasks`: `{ id, title, status, priority, effortMinutes: number|null, dueAt: number|null,
  course, completedAt }[]` — from the tasks repo (non-archived, non-done for load purposes)
- `commitments`: `{ id, title, start, end }[]` for `[weekStart, weekEnd]`
- `capacityProfile`: `{ [dayOfWeek 0..6]: hours }` (from `capacity_profile` table)
- `now`: epoch ms (injected; default `Date.now()`)

## 2. Effort estimation (`effort.ts`)

1. If `task.effortMinutes != null` → use it.
2. Else if `settings.effortCourseOverrides[task.course]` → use it.
3. Else `settings.effortDefaults[task.source ?? 'assignment']` (defaults: assignment 180,
   email 15).
4. **Self-refinement** (runs during derivation, weekly): for completed tasks
   (`completedAt` within last 60 days) compare estimated vs a completion-weight heuristic
   (effort × status-dwell time is too complex — instead: when a task is marked done, the UI
   optionally records `actualMinutes`; weekly, for each course with ≥ 5 samples, set
   `effortCourseOverrides[course] = median(actualMinutes)`). Keep it simple and manual-ish;
   the median rule is the whole algorithm.

Effort is shown everywhere as "~3h" style with a pencil to edit (edits pin `effortMinutes`
via the override policy).

## 3. Backward-fill scheduler (`capacity.ts`)

Splits each task's effort into day blocks, packed into the **latest** available day before
its due date, using greedy fill. Produces `scheduledBlocks: { taskId, day, minutes }[]` and
per-day load.

```
function schedule(tasks, commitments, capacityProfile, now):
  days = [today .. today+6]  (local tz)
  cap[d] = capacityProfile[weekday(d)] * 60 - committedMinutes(d)      # minutes
  load[d] = 0  for all d
  blocks = []
  # only open, due within horizon, or overdue tasks; done/archived excluded
  queue = tasks where status != done && (dueAt <= today+7d || status == blocked)
  queue.sort(by dueAt ASC, overdue first)
  for task in queue:
    effort = effectiveEffort(task)                    # §2
    remaining = effort
    day = dayIndexOf(task.dueAt) if dueAt else today  # no dueAt → pack from today forward?? no: pack into NEXT free days, see note
    while remaining > 0 and day >= todayIndex:
      free = cap[day] - load[day]
      if free > 0:
        take = min(remaining, free)
        blocks.push({ taskId: task.id, day, minutes: take })
        load[day] += take
        remaining -= take
      day -= 1
    task.flag = remaining > 0 ? 'at-risk' : 'ok'      # didn't fit before due date
  # no-dueAt tasks: distribute into the first day with free capacity (forward from today)
  return { blocks, load, flags }
```

Note: `cap` can be negative (commitments exceed capacity) — such days are treated as 0
free. Days with 0 capacity (`sat`/`sun` defaults) are skipped naturally.

The same pass drives:
- **per-day load bars** (`load[d] / cap[d]`), colors: <80% green, 80–100% amber, >100% red
- **at-risk flags** (didn't fit) → dashboard "at risk" list
- **busyness summary**: per day `committedMinutes` vs `cap` (calendar busy) plus task load;
  the week headline is `busyDays` count (days >100% combined) and the single "busiest day".

## 4. Ranking (`rank.ts`) — explainable

Score for each open task (not done, not archived):

```
urgency   = clamp(1.5 - daysUntilDue / 7, 0.05, 1.5)   # due soon → high; overdue → 1.5 cap
importance= courseGradeWeight(task.course)  or 0.5      # from grades; see domain-model §2.2
effort    = clamp(effortMinutes / 240, 0.5, 2)          # bigger tasks rank higher
base      = userPriority(task.priority)                 # -1 → 0; else priority/4 (0..1)
score     = 10*base + 6*urgency + 3*importance + 1*effort
```

`rankTasks` returns `[{ task, score, why: string[] }]` where `why` lists the contributing
factors with plain-language reasons, e.g. `["due in 12h", "high grade weight (CS 101)",
"~3h effort", "priority high"]`. The dashboard's "Work on this next" card always renders
the top 5 with their `why` — no black box. Ties break by dueAt asc, then title.

`courseGradeWeight(course)` = max over grades for that course of `score/max_score` when
both non-null, else 0.5.

## 5. Definitions

| Term | Definition |
|---|---|
| committed minutes (day d) | Σ(end - start) of commitments overlapping d, clipped to d |
| capacity (day d) | `capacityProfile[weekday] * 60` |
| load (day d) | Σ scheduled task minutes (from backward fill) |
| busy% (day d) | `(committed + load) / capacity * 100` |
| at-risk task | open task due within 7 days whose effort didn't fully fit |
| week headline | `busyDays` = count of days with busy% > 100; plus busiest day label |

## 6. Storage

- `capacity_profile` rows (user-edited in Settings; 7 rows, seeded defaults)
- `settings.effortDefaults`, `settings.effortCourseOverrides` (self-refinement writes here)

## 7. Unit tests (required)

- backward fill: task due Friday packs into Fri→Thu…; overflow into prior days; 0-capacity
  weekends skipped; at-risk when cannot fit
- committed overlap: event spanning midnight counts in both days, clipped
- busy% boundaries: 80/100 thresholds; negative free capacity handled
- ranking: overdue > due soon > later; priority dominates; `why` includes expected strings
- effort: override > course > default chain
