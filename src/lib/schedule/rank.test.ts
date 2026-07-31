import { describe, expect, it } from "vitest";
import {
  clamp,
  courseGradeWeight,
  gradeWeightByCourse,
  rankTasks,
  type RankableTask,
  type RankOptions,
} from "./rank";
import { DAY_MS, startOfDay } from "../time";
import type { GradePayload } from "../pks/types";

const NOW = startOfDay(new Date(2026, 6, 15, 8, 0, 0).getTime()); // Wed Jul 15 2026

const effort = { effortDefaults: { assignment: 180, email: 15 }, effortCourseOverrides: {} };
const gradeWeights = { "CS 101": 0.9, "MATH 230": 0.5 };

const opts = (now = NOW): RankOptions => ({ effortSettings: effort, gradeWeights, now });

function task(id: string, patch: Partial<RankableTask> = {}): RankableTask {
  return {
    id,
    title: `Task ${id}`,
    status: "backlog",
    priority: -1,
    effortMinutes: null,
    dueAt: null,
    course: null,
    source: "assignment",
    archivedAt: null,
    ...patch,
  };
}

describe("rankTasks", () => {
  it("ranks overdue above due-soon above later", () => {
    const ranked = rankTasks(
      [
        task("late", { dueAt: NOW - DAY_MS }),
        task("soon", { dueAt: NOW + DAY_MS }),
        task("later", { dueAt: NOW + 10 * DAY_MS }),
      ],
      opts(),
    );
    expect(ranked.map((r) => r.task.id)).toEqual(["late", "soon", "later"]);
  });

  it("priority dominates", () => {
    const ranked = rankTasks(
      [
        task("laterHigh", { dueAt: NOW + 10 * DAY_MS, priority: 4 }),
        task("soonAuto", { dueAt: NOW + DAY_MS }),
      ],
      opts(),
    );
    expect(ranked.map((r) => r.task.id)).toEqual(["laterHigh", "soonAuto"]);
  });

  it("excludes done and archived tasks", () => {
    const ranked = rankTasks(
      [task("a", { status: "done" }), task("b", { archivedAt: NOW })],
      opts(),
    );
    expect(ranked).toEqual([]);
  });

  it("why includes expected strings", () => {
    const [r] = rankTasks([task("t", { dueAt: NOW + DAY_MS })], opts());
    expect(r.why).toContain("due tomorrow");
    expect(r.why).toContain("~3h effort");
    const [over] = rankTasks([task("t", { dueAt: NOW - DAY_MS })], opts());
    expect(over.why).toContain("overdue");
    const [prio] = rankTasks([task("t", { priority: 4 })], opts());
    expect(prio.why).toContain("priority high");
    const [course] = rankTasks([task("t", { course: "CS 101" })], opts());
    expect(course.why.some((w) => w.includes("high grade weight"))).toBe(true);
    const [noDue] = rankTasks([task("t", {})], opts());
    expect(noDue.why).toContain("no due date");
  });

  it("breaks ties by due date then title", () => {
    const ranked = rankTasks(
      [
        task("b", { dueAt: NOW + 3 * DAY_MS }),
        task("a", { dueAt: NOW + 2 * DAY_MS }),
        task("c", { dueAt: NOW + 2 * DAY_MS }),
      ],
      opts(),
    );
    expect(ranked.map((r) => r.task.id)).toEqual(["a", "c", "b"]);
  });

  it("scores are deterministic and bounded", () => {
    const ranked = rankTasks(
      [task("t", { priority: 4, dueAt: NOW - DAY_MS, course: "CS 101", effortMinutes: 600 })],
      opts(),
    );
    const [r] = ranked;
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(10 + 6 * 1.5 + 3 + 2);
  });
});

describe("clamp", () => {
  it("clamps to the range", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe("courseGradeWeight", () => {
  it("uses the max normalized grade per course", () => {
    expect(gradeWeightByCourse([
      { course_name: "CS 101", score: 45, max_score: 50 },
      { course_name: "CS 101", score: 18, max_score: 20 },
      { course_name: "MATH 230", score: 28, max_score: 30 },
    ] as GradePayload[])).toEqual({ "CS 101": 0.9, "MATH 230": 0.9333333333333333 });
  });

  it("falls back to 0.5 for unknown courses", () => {
    expect(courseGradeWeight(null, {})).toBe(0.5);
    expect(courseGradeWeight("PHYS 120", {})).toBe(0.5);
  });

  it("ignores grades with missing or zero max", () => {
    expect(gradeWeightByCourse([
      { course_name: "CS 101", score: 10, max_score: null },
      { course_name: "CS 101", score: 10, max_score: 0 },
      { course_name: "CS 101", score: 8, max_score: 10 },
    ] as GradePayload[])).toEqual({ "CS 101": 0.8 });
  });
});
