import { describe, expect, it } from "vitest";
import { effectiveEffort, type EffortSettings } from "./effort";

const baseSettings: EffortSettings = {
  effortDefaults: { assignment: 180, email: 15 },
  effortCourseOverrides: { "CS 101": 240 },
};

const task = (patch: Partial<Parameters<typeof effectiveEffort>[0]> = {}) => ({
  effortMinutes: null,
  course: null,
  source: null,
  ...patch,
});

describe("effectiveEffort", () => {
  it("uses explicit effortMinutes first", () => {
    expect(effectiveEffort(task({ effortMinutes: 45, course: "CS 101" }), baseSettings)).toBe(45);
  });

  it("falls back to the course override", () => {
    expect(effectiveEffort(task({ course: "CS 101", source: "d2l" }), baseSettings)).toBe(240);
  });

  it("falls back to the source default", () => {
    expect(effectiveEffort(task({ source: "email" }), baseSettings)).toBe(15);
    expect(effectiveEffort(task({ source: "assignment" }), baseSettings)).toBe(180);
  });

  it("unknown source falls back to the assignment default", () => {
    expect(effectiveEffort(task({ source: "manual" }), baseSettings)).toBe(180);
    expect(effectiveEffort(task({}), baseSettings)).toBe(180);
  });

  it("missing defaults fall back to 180", () => {
    expect(effectiveEffort(task({}), { effortDefaults: {}, effortCourseOverrides: {} })).toBe(180);
  });

  it("course override beats source default", () => {
    expect(effectiveEffort(task({ course: "CS 101", source: "email" }), baseSettings)).toBe(240);
  });
});
