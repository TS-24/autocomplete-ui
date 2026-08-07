/**
 * Backward-fill scheduler (docs/capacity-engine.md §3) — pure, unit-tested.
 *
 * Splits each open task's effort into day blocks packed into the latest
 * available day before its due date (greedy backward fill), producing
 * per-day load, at-risk flags, and the busyness summary.
 */
import { DAY_MS, addDays, startOfDay } from "../time";
import { effectiveEffort, type EffortSettings } from "./effort";

export interface TaskLike {
  id: string;
  status: string;
  dueAt: number | null;
  effortMinutes: number | null;
  course: string | null;
  source: string | null;
  archivedAt: number | null;
}

export interface Commitment {
  id: string;
  title: string;
  start: number;
  end: number;
}

export type CapacityProfile = Record<string, number>; // mon..sun → hours

export interface ScheduledBlock {
  taskId: string;
  day: number; // startOfDay(ms) of the local day
  minutes: number;
}

export interface ScheduleResult {
  /** The 7-day horizon, local midnights: today .. today+6. */
  days: number[];
  blocks: ScheduledBlock[];
  /** day startOfDay(ms) → scheduled task minutes. */
  load: Record<number, number>;
  /** day startOfDay(ms) → committed (calendar) minutes, clipped to the day. */
  committed: Record<number, number>;
  /** day startOfDay(ms) → capacity in minutes (profile hours × 60). */
  capMinutes: Record<number, number>;
  /** taskId → "at-risk" (didn't fully fit) | "ok". */
  flags: Record<string, "at-risk" | "ok">;
  /** busy% = (committed + load) / capacity × 100; Infinity when cap is 0 but busy. */
  busyPct: Record<number, number>;
  /** Days with busy% > 100. */
  busyDays: number;
  /** The single busiest day (startOfDay ms); null when the week is empty. */
  busiestDay: number | null;
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function weekdayKey(t: number): string {
  return WEEKDAY_KEYS[new Date(t).getDay()];
}

/** Σ(end - start) of commitments overlapping day d, clipped to the day. */
function committedMinutesForDay(
  commitments: Commitment[],
  day: number,
): number {
  const dayEnd = day + DAY_MS;
  let total = 0;
  for (const c of commitments) {
    const overlap = Math.min(c.end, dayEnd) - Math.max(c.start, day);
    if (overlap > 0) total += overlap;
  }
  return total;
}

const HORIZON_DAYS = 7;

export function schedule(
  tasks: TaskLike[],
  commitments: Commitment[],
  capacityProfile: CapacityProfile,
  effortSettings: EffortSettings,
  now: number = Date.now(),
): ScheduleResult {
  const today = startOfDay(now);
  const days = Array.from({ length: HORIZON_DAYS }, (_, i) =>
    addDays(today, i),
  );

  const committed: Record<number, number> = {};
  const capMinutes: Record<number, number> = {};
  for (const d of days) {
    const committedMin = committedMinutesForDay(commitments, d);
    committed[d] = committedMin;
    const hours = capacityProfile[weekdayKey(d)] ?? 0;
    capMinutes[d] = Math.max(0, hours * 60 - committedMin);
  }

  const horizonEnd = addDays(today, HORIZON_DAYS);
  const queue = tasks
    .filter(
      (t) =>
        t.status !== "done" &&
        t.archivedAt === null &&
        (t.dueAt === null ||
          t.dueAt <= horizonEnd ||
          t.status === "blocked"),
    )
    .sort(
      (a, b) =>
        (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.id.localeCompare(b.id),
    );

  const load: Record<number, number> = {};
  for (const d of days) load[d] = 0;
  const blocks: ScheduledBlock[] = [];
  const flags: Record<string, "at-risk" | "ok"> = {};

  for (const task of queue) {
    const effort = effectiveEffort(task, effortSettings);
    let remaining = effort;
    const dayIndex =
      task.dueAt === null
        ? -1
        : Math.max(0, Math.floor((startOfDay(task.dueAt) - today) / DAY_MS));

    if (dayIndex === -1) {
      // No due date: pack forward from today into the first free days.
      for (let i = 0; i < HORIZON_DAYS && remaining > 0; i++) {
        const d = days[i];
        const free = capMinutes[d] - (load[d] ?? 0);
        if (free > 0) {
          const take = Math.min(remaining, free);
          blocks.push({ taskId: task.id, day: d, minutes: take });
          load[d] = (load[d] ?? 0) + take;
          remaining -= take;
        }
      }
    } else {
      // Due within the horizon: pack backward from the due day (overdue → today).
      for (let i = dayIndex; i >= 0 && remaining > 0; i--) {
        const d = days[i];
        const free = capMinutes[d] - (load[d] ?? 0);
        if (free > 0) {
          const take = Math.min(remaining, free);
          blocks.push({ taskId: task.id, day: d, minutes: take });
          load[d] = (load[d] ?? 0) + take;
          remaining -= take;
        }
      }
    }

    flags[task.id] = remaining > 0 ? "at-risk" : "ok";
  }

  const busyPct: Record<number, number> = {};
  let busyDays = 0;
  let busiestDay: number | null = null;
  let busiestRatio = -1;
  for (const d of days) {
    const combined = committed[d] + (load[d] ?? 0);
    const pct =
      capMinutes[d] > 0 ? (combined / capMinutes[d]) * 100 : combined > 0 ? Infinity : 0;
    busyPct[d] = pct;
    if (pct > 100) busyDays += 1;
    const ratio = capMinutes[d] > 0 ? pct : combined > 0 ? Infinity : 0;
    if (ratio > busiestRatio) {
      busiestRatio = ratio;
      busiestDay = d;
    }
  }

  return { days, blocks, load, committed, capMinutes, flags, busyPct, busyDays, busiestDay };
}
