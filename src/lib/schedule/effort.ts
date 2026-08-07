/**
 * Effort estimation (docs/capacity-engine.md §2) — pure, unit-tested.
 */

export interface EffortSettings {
  /** Per-source fallback minutes (e.g. { assignment: 180, email: 15 }). */
  effortDefaults: Record<string, number>;
  /** Per-course overrides, keyed by course name. */
  effortCourseOverrides: Record<string, number>;
}

/**
 * Resolution chain: explicit task effort → course override → source default →
 * assignment default. Never returns null — every task has an estimable effort.
 */
export function effectiveEffort(
  task: Pick<TaskLike, "effortMinutes" | "course" | "source">,
  settings: EffortSettings,
): number {
  if (task.effortMinutes !== null && task.effortMinutes !== undefined) {
    return task.effortMinutes;
  }
  if (task.course && settings.effortCourseOverrides[task.course] != null) {
    return settings.effortCourseOverrides[task.course];
  }
  const bySource =
    settings.effortDefaults[task.source ?? "assignment"] ??
    settings.effortDefaults.assignment;
  return bySource ?? 180;
}

interface TaskLike {
  effortMinutes: number | null;
  course: string | null;
  source: string | null;
}
