import { describe, expect, it } from "vitest";
import {
  effortMinutesFor,
  formatEffort,
  groupTasksByStatus,
  isOverdue,
  statusFromDropTarget,
} from "./kanban";
import type { Task } from "../db/schema";

const T0 = new Date(2026, 6, 15, 12, 0, 0); // Wed Jul 15 2026 12:00 local

function task(id: string, status: Task["status"], patch: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    originKind: "assignment",
    originExternalId: `asg-${id}`,
    originConnectorId: "c",
    originEntityType: "assignment",
    status,
    priority: -1,
    effortMinutes: null,
    dueAt: null,
    course: null,
    source: "d2l",
    overrides: {},
    completedAt: null,
    createdAt: T0,
    updatedAt: T0,
    archivedAt: null,
    ...patch,
  };
}

describe("groupTasksByStatus", () => {
  it("groups and sorts by priority (auto last), then due, then title", () => {
    const tasks = [
      task("a", "backlog", { priority: 2 }),
      task("b", "backlog", { priority: -1, title: "Zed" }),
      task("c", "backlog", { priority: 3 }),
      task("d", "done"),
      task("e", "backlog", { priority: 2, title: "Aaa", dueAt: new Date(T0.getTime() + 86_400_000) }),
    ];
    const groups = groupTasksByStatus(tasks);
    expect(groups.backlog.map((t) => t.id)).toEqual(["c", "e", "a", "b"]);
    expect(groups.done.map((t) => t.id)).toEqual(["d"]);
    expect(groups.next).toEqual([]);
  });
});

describe("effortMinutesFor", () => {
  const defaults = { assignment: 180, email: 15, manual: 60 };
  it("uses explicit effort when set", () => {
    expect(effortMinutesFor(task("a", "backlog", { effortMinutes: 45 }), defaults)).toBe(45);
  });
  it("falls back to the source default", () => {
    expect(effortMinutesFor(task("a", "backlog"), defaults)).toBe(180);
    expect(effortMinutesFor({ ...task("a", "backlog"), source: "email" }, defaults)).toBe(15);
  });
});

describe("formatEffort", () => {
  it("formats minutes as h/m", () => {
    expect(formatEffort(45)).toBe("45m");
    expect(formatEffort(180)).toBe("3h");
    expect(formatEffort(150)).toBe("2.5h");
  });
});

describe("isOverdue", () => {
  it("flags due-before-today, not done", () => {
    expect(isOverdue(task("a", "backlog", { dueAt: new Date(T0.getTime() - 86_400_000) }), T0.getTime())).toBe(true);
    expect(isOverdue(task("a", "backlog", { dueAt: T0 }), T0.getTime())).toBe(false);
    expect(isOverdue(task("a", "done", { dueAt: new Date(T0.getTime() - 86_400_000) }), T0.getTime())).toBe(false);
    expect(isOverdue(task("a", "backlog"), T0.getTime())).toBe(false);
  });
});

describe("statusFromDropTarget", () => {
  const byId = new Map([task("t1", "in_progress"), task("t2", "next")].map((t) => [t.id, t]));
  it("parses column ids", () => {
    expect(statusFromDropTarget("column-backlog", byId)).toBe("backlog");
    expect(statusFromDropTarget("column-done", byId)).toBe("done");
    expect(statusFromDropTarget("column-nope", byId)).toBeNull();
  });
  it("resolves task ids to their current column", () => {
    expect(statusFromDropTarget("t1", byId)).toBe("in_progress");
    expect(statusFromDropTarget("t2", byId)).toBe("next");
    expect(statusFromDropTarget("unknown", byId)).toBeNull();
  });
});
