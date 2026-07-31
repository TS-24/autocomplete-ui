import type { Task, TaskStatus } from "../db/schema";
import { startOfDay } from "./time";

/**
 * Pure kanban helpers — no DB, no React; unit-tested.
 */

export const KANBAN_COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "next", label: "Next" },
  { id: "in_progress", label: "In Progress" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
];

export function groupTasksByStatus(
  tasks: Task[],
): Record<TaskStatus, Task[]> {
  const groups: Record<TaskStatus, Task[]> = {
    backlog: [],
    next: [],
    in_progress: [],
    blocked: [],
    done: [],
  };
  for (const t of tasks) groups[t.status].push(t);
  for (const list of Object.values(groups)) {
    list.sort(
      (a, b) =>
        (b.priority === -1 ? -1 : b.priority) -
          (a.priority === -1 ? -1 : a.priority) ||
        (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) ||
        a.title.localeCompare(b.title),
    );
  }
  return groups;
}

export interface EffortDefaults {
  assignment?: number;
  email?: number;
  manual?: number;
}

/** Resolve a task's effort: explicit value, else source heuristic. */
export function effortMinutesFor(
  task: Pick<Task, "effortMinutes" | "source">,
  defaults: EffortDefaults,
): number {
  if (task.effortMinutes !== null && task.effortMinutes !== undefined) {
    return task.effortMinutes;
  }
  const bySource = defaults[task.source as keyof EffortDefaults];
  return bySource ?? defaults.assignment ?? 0;
}

/** "2.5h", "45m" */
export function formatEffort(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

/** Due today-or-earlier and not done (spec: due chip red when overdue). */
export function isOverdue(
  task: Pick<Task, "dueAt" | "status">,
  now = Date.now(),
): boolean {
  if (task.status === "done" || task.dueAt === null) return false;
  return task.dueAt.getTime() < startOfDay(now);
}

/** Map a dnd-kit drop target to a column: "column-<status>" ids or a task id. */
export function statusFromDropTarget(
  targetId: string,
  taskById: Map<string, Task>,
): TaskStatus | null {
  if (targetId.startsWith("column-")) {
    const status = targetId.slice("column-".length);
    return KANBAN_COLUMNS.some((c) => c.id === status)
      ? (status as TaskStatus)
      : null;
  }
  return taskById.get(targetId)?.status ?? null;
}
