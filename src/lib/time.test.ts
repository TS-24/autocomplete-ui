import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  addDays,
  daysUntil,
  formatRelative,
  startOfDay,
  startOfWeek,
} from "./time";

describe("time helpers", () => {
  it("startOfDay returns local midnight", () => {
    const t = new Date(2026, 6, 15, 14, 30, 0).getTime();
    expect(startOfDay(t)).toBe(new Date(2026, 6, 15).getTime());
    expect(new Date(startOfDay(t)).getHours()).toBe(0);
  });

  it("startOfWeek returns Monday local midnight", () => {
    // Wed Jul 15 2026 -> Mon Jul 13 2026
    const wed = new Date(2026, 6, 15, 10, 0).getTime();
    const mon = startOfWeek(wed);
    expect(new Date(mon).getDay()).toBe(1);
    expect(new Date(mon).getHours()).toBe(0);
    expect(mon).toBe(new Date(2026, 6, 13).getTime());
    // Monday itself is the start of its own week
    expect(startOfWeek(mon)).toBe(mon);
    // Sunday Jul 19 -> Mon Jul 13
    expect(startOfWeek(new Date(2026, 6, 19, 23, 0).getTime())).toBe(mon);
  });

  it("addDays shifts by whole local days", () => {
    const t = new Date(2026, 6, 15, 18, 0).getTime();
    expect(addDays(t, 1)).toBe(t + DAY_MS);
  });

  it("daysUntil counts local days", () => {
    const now = new Date(2026, 6, 15, 23, 0).getTime();
    expect(daysUntil(now, new Date(2026, 6, 16, 1, 0).getTime())).toBe(1);
    expect(daysUntil(now, new Date(2026, 6, 15, 1, 0).getTime())).toBe(0);
    expect(daysUntil(now, new Date(2026, 6, 13, 23, 0).getTime())).toBe(-2);
  });

  it("formatRelative renders human labels", () => {
    const now = new Date(2026, 6, 15, 12, 0).getTime();
    expect(formatRelative(new Date(2026, 6, 15, 9, 0).getTime(), now)).toBe(
      "today",
    );
    expect(formatRelative(new Date(2026, 6, 16, 9, 0).getTime(), now)).toBe(
      "tomorrow",
    );
    expect(formatRelative(new Date(2026, 6, 14, 9, 0).getTime(), now)).toBe(
      "yesterday",
    );
    expect(formatRelative(new Date(2026, 6, 18, 9, 0).getTime(), now)).toBe(
      "in 3d",
    );
    expect(formatRelative(new Date(2026, 6, 10, 9, 0).getTime(), now)).toBe(
      "5d ago",
    );
  });
});
