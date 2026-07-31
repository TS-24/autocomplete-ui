import { describe, expect, it } from "vitest";
import { schedule, type Commitment, type TaskLike } from "./capacity";
import { DAY_MS, startOfDay } from "../time";

const MONDAY = startOfDay(new Date(2026, 6, 13, 9, 0, 0).getTime()); // Jul 13 2026
const T0 = MONDAY;

const capacity = { mon: 4, tue: 4, wed: 4, thu: 4, fri: 4, sat: 0, sun: 0 };
const effort = { effortDefaults: { assignment: 180, email: 15 }, effortCourseOverrides: {} };

function task(id: string, patch: Partial<TaskLike> = {}): TaskLike {
  return {
    id,
    status: "backlog",
    dueAt: null,
    effortMinutes: null,
    course: null,
    source: "assignment",
    archivedAt: null,
    ...patch,
  };
}

const day = (i: number) => T0 + i * DAY_MS;
const h = (d: number, hh: number) => day(d) + hh * 3_600_000;

describe("backward-fill scheduler", () => {
  it("packs a due-Friday task into Friday first, overflow into Thursday", () => {
    const res = schedule(
      [task("t1", { dueAt: day(4) + 8 * 3_600_000 })], // Friday 08:00
      [],
      capacity,
      effort,
      T0,
    );
    // 180m: Friday free = 240m → all fits Friday
    expect(res.load[day(4)]).toBe(180);
    expect(res.blocks).toEqual([{ taskId: "t1", day: day(4), minutes: 180 }]);
    expect(res.flags.t1).toBe("ok");
  });

  it("overflows into prior days when the due day is full", () => {
    const commitments: Commitment[] = [
      { id: "c1", title: "class", start: h(4, 9), end: h(4, 17) }, // Friday 9-17
    ];
    const res = schedule([task("t1", { dueAt: day(4) })], commitments, capacity, effort, T0);
    // Friday free = 4h - 8h = -4h → 0. Thursday free = 240m → all 180m Thursday
    expect(res.load[day(4)]).toBe(0);
    expect(res.load[day(3)]).toBe(180);
    expect(res.flags.t1).toBe("ok");
  });

  it("skips zero-capacity weekends", () => {
    // Due Monday next week; backward fill should land Fri → Thu (sat/sun 0).
    const res = schedule([task("t1", { dueAt: day(7) })], [], capacity, effort, T0);
    expect(res.load[day(6)]).toBe(0); // sun
    expect(res.load[day(5)]).toBe(0); // sat
    expect(res.load[day(4)]).toBe(180); // fri
    expect(res.flags.t1).toBe("ok");
  });

  it("flags at-risk when effort cannot fit before the due date", () => {
    // Every day before Friday is fully committed → nothing can fit.
    const commitments: Commitment[] = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      title: "blocked",
      start: h(i, 9),
      end: h(i, 17),
    }));
    const res = schedule(
      [task("t1", { dueAt: day(4), effortMinutes: 600 })], // 10h task, 0 free days
      commitments,
      capacity,
      effort,
      T0,
    );
    expect(res.flags.t1).toBe("at-risk");
    expect(res.load[day(4)]).toBe(0);
    expect(res.load[day(3)]).toBe(0);
    expect(res.load[day(0)]).toBe(0);
  });

  it("overdue tasks pack into today", () => {
    const res = schedule([task("t1", { dueAt: day(-2) })], [], capacity, effort, T0);
    expect(res.load[day(0)]).toBe(180);
    expect(res.flags.t1).toBe("ok");
  });

  it("no-due-date tasks pack forward from today", () => {
    // Monday fully committed → task lands Tuesday
    const commitments: Commitment[] = [
      { id: "c1", title: "class", start: h(0, 9), end: h(0, 17) },
    ];
    const res = schedule([task("t1", {})], commitments, capacity, effort, T0);
    expect(res.load[day(0)]).toBe(0);
    expect(res.load[day(1)]).toBe(180);
    expect(res.flags.t1).toBe("ok");
  });

  it("excludes done and archived tasks", () => {
    const res = schedule(
      [
        task("done1", { status: "done", dueAt: day(1) }),
        task("arch1", { archivedAt: T0, dueAt: day(1) }),
      ],
      [],
      capacity,
      effort,
      T0,
    );
    expect(res.blocks).toEqual([]);
    expect(res.flags).toEqual({});
  });

  it("a commitment spanning midnight counts in both days, clipped", () => {
    const overnight: Commitment[] = [
      { id: "c1", title: "overnight", start: h(2, 23), end: h(3, 2) },
    ];
    const res = schedule([], overnight, capacity, effort, T0);
    expect(res.committed[day(2)]).toBe(3_600_000); // 23:00-24:00
    expect(res.committed[day(3)]).toBe(7_200_000); // 00:00-02:00
  });

  it("negative free capacity is treated as zero", () => {
    const commitments: Commitment[] = [
      { id: "c1", title: "all day", start: h(0, 0), end: h(0, 12) }, // 12h vs 4h cap
    ];
    const res = schedule([task("t1", { dueAt: day(0), effortMinutes: 60 })], commitments, capacity, effort, T0);
    expect(res.load[day(0)]).toBe(0);
    expect(res.flags.t1).toBe("at-risk");
  });

  it("computes busyDays and busiestDay from combined load", () => {
    const commitments: Commitment[] = [
      { id: "c1", title: "heavy", start: h(1, 8), end: h(1, 14) }, // 6h vs 4h cap → >100%
    ];
    const res = schedule([task("t1", { dueAt: day(1), effortMinutes: 120 })], commitments, capacity, effort, T0);
    // Tue: committed 360m, cap 240 → 150% already; task packs earlier (Mon)
    expect(res.busyPct[day(1)]).toBeGreaterThan(100);
    expect(res.busyDays).toBe(1);
    expect(res.busiestDay).toBe(day(1));
  });

  it("zero-capacity weekend counts as busy when it carries load", () => {
    // Saturday (0 cap) carries a 1h commitment → busy% = Infinity.
    const commitments: Commitment[] = [
      { id: "c1", title: "weekend duty", start: h(5, 10), end: h(5, 11) },
    ];
    const res = schedule([], commitments, capacity, effort, T0);
    expect(res.busyPct[day(5)]).toBe(Infinity);
    expect(res.busyDays).toBe(1);
    expect(res.busiestDay).toBe(day(5));
  });
});
