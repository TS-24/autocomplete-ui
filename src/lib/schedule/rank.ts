/**
 * Explainable task ranking (docs/capacity-engine.md §4) — pure, unit-tested.
 *
 * score = 10·base + 6·urgency + 3·importance + 1·effort
 */
import { daysUntil } from "../time";
import { effectiveEffort, type EffortSettings } from "./effort";
import type { GradePayload } from "../pks/types";

export interface RankableTask {
  id: string;
  title: string;
  status: string;
  priority: number;
  effortMinutes: number | null;
  dueAt: number | null;
  course: string | null;
  source: string | null;
  archivedAt: number | null;
}

export interface RankedTask {
  task: RankableTask;
  score: number;
  why: string[];
}

export interface RankOptions {
  effortSettings: EffortSettings;
  /** course → normalized grade weight (0..1); missing courses default to 0.5. */
  gradeWeights?: Record<string, number>;
  now?: number;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** max(score/max_score) per course when both non-null, else 0.5 (domain-model §2.2). */
export function gradeWeightByCourse(grades: GradePayload[]): Record<string, number> {
  const best: Record<string, number> = {};
  for (const g of grades) {
    if (g.score === null || g.score === undefined || g.max_score === null || g.max_score === undefined || g.max_score <= 0) continue;
    const weight = g.score / g.max_score;
    const course = g.course_name || "";
    if (!course) continue;
    if (best[course] === undefined || weight > best[course]) best[course] = weight;
  }
  for (const course of Object.keys(best)) {
    if (best[course] <= 0) delete best[course];
  }
  return best;
}

export function courseGradeWeight(course: string | null, gradeWeights: Record<string, number>): number {
  return course && gradeWeights[course] != null ? gradeWeights[course] : 0.5;
}

function whyStrings(task: RankableTask, urgency: number, base: number, importance: number, effort: number, now: number): string[] {
  const why: string[] = [];
  if (task.dueAt === null) {
    why.push("no due date");
  } else {
    const d = daysUntil(now, task.dueAt);
    if (d < 0) why.push("overdue");
    else if (d === 0) why.push("due today");
    else if (d === 1) why.push("due tomorrow");
    else why.push(`due in ${d}d`);
  }
  if (base > 0) {
    if (task.priority >= 3) why.push("priority high");
    else if (task.priority === 2) why.push("priority medium");
    else why.push("priority low");
  }
  if (importance > 0.6 && task.course) {
    why.push(`high grade weight (${task.course})`);
  }
  if (urgency >= 1.2 && task.dueAt !== null) why.push("urgent");
  why.push(`~${formatEffortHours(effort)} effort`);
  return why;
}

function formatEffortHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

/**
 * Rank open tasks (not done, not archived), best first. Ties break by dueAt
 * asc, then title.
 */
export function rankTasks(tasks: RankableTask[], opts: RankOptions): RankedTask[] {
  const now = opts.now ?? Date.now();
  const weights = opts.gradeWeights ?? {};
  const open = tasks.filter((t) => t.status !== "done" && t.archivedAt === null);
  const ranked = open.map((task) => {
    const due = task.dueAt === null ? null : daysUntil(now, task.dueAt);
    const urgency = due === null ? 0.05 : clamp(1.5 - due / 7, 0.05, 1.5);
    const base = task.priority === -1 ? 0 : clamp(task.priority / 4, 0, 1);
    const importance = courseGradeWeight(task.course, weights);
    const effectiveMinutes = effectiveEffort(task, opts.effortSettings);
    const effort = clamp(effectiveMinutes / 240, 0.5, 2);
    const score = 10 * base + 6 * urgency + 3 * importance + 1 * effort;
    return {
      task,
      score,
      why: whyStrings(task, urgency, base, importance, effectiveMinutes, now),
    };
  });
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      (a.task.dueAt ?? Infinity) - (b.task.dueAt ?? Infinity) ||
      a.task.title.localeCompare(b.task.title),
  );
  return ranked;
}
