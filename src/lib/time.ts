export const DAY_MS = 86_400_000;

/** Local-midnight start of the day containing `t` (epoch ms). */
export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local-midnight start of the week (Monday) containing `t`. */
export function startOfWeek(t: number): number {
  const day = startOfDay(t);
  const dow = new Date(day).getDay(); // 0 = Sunday
  const mondayOffset = (dow + 6) % 7; // days since Monday
  return day - mondayOffset * DAY_MS;
}

export function addDays(t: number, days: number): number {
  return t + days * DAY_MS;
}

/** Whole days from `from` to `to` in local time; negative = `to` is in the past. */
export function daysUntil(from: number, to: number): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
}

/** Human-relative label for a timestamp, e.g. "today", "in 3d", "2d ago". */
export function formatRelative(t: number, now: number = Date.now()): string {
  const days = daysUntil(now, t);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < 0) return `${-days}d ago`;
  return `in ${days}d`;
}
