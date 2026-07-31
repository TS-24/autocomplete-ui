import { describe, expect, it } from "vitest";
import { planDerive } from "./derive";
import { fromTaskWrite } from "../../db/repo/tasks.repo";
import type { MirrorRow } from "./sources";
import type { Task } from "../../db/schema";
const T0 = 1_750_000_000_000;
const HOUR = 3_600_000;

function assignmentRow(
  externalId: string,
  payload: Record<string, unknown>,
  opts: { deleted?: boolean; updatedAt?: number } = {},
): MirrorRow {
  return {
    connectorId: "conn-d2l",
    entityType: "assignment",
    externalId,
    payload,
    version: 1,
    updatedAt: opts.updatedAt ?? T0,
    deletedAt: opts.deleted ? T0 - 60_000 : null,
  };
}

const asg = (id: string, status: string, dueInH: number | null) =>
  assignmentRow(id, {
    external_id: id,
    course_name: "CS 101",
    title: `Assignment ${id}`,
    due_date: dueInH === null ? null : new Date(T0 + dueInH * HOUR).toISOString(),
    status,
  });

describe("planDerive", () => {
  it("creates tasks for live assignments", () => {
    const plan = planDerive([asg("a1", "not submitted", 24)], [], T0);
    expect(plan.upserts).toHaveLength(1);
    const t = plan.upserts[0];
    expect(t.title).toBe("Assignment a1");
    expect(t.status).toBe("next"); // due within 48h
    expect(t.course).toBe("CS 101");
    expect(t.originKind).toBe("assignment");
    expect(t.originExternalId).toBe("a1");
    expect(t.overrides).toEqual({});
  });

  it("maps statuses per domain-model §3.1", () => {
    const cases: [string, string][] = [
      ["submitted", "done"],
      ["overdue", "blocked"],
      ["not submitted", "backlog"],
      ["not_started", "backlog"],
      ["started", "in_progress"],
      ["weird future status", "backlog"],
    ];
    for (const [upstream, expected] of cases) {
      const plan = planDerive([asg("x", upstream, null)], [], T0);
      expect(plan.upserts[0].status, upstream).toBe(expected);
    }
  });

  it("due within 48h bumps backlog → next; beyond stays backlog", () => {
    const near = planDerive([asg("x", "not_started", 40)], [], T0);
    expect(near.upserts[0].status).toBe("next");
    const far = planDerive([asg("x", "not_started", 100)], [], T0);
    expect(far.upserts[0].status).toBe("backlog");
  });

  it("is idempotent: unchanged mirror produces an empty plan", () => {
    const mirror = [asg("a1", "not submitted", 24)];
    const first = planDerive(mirror, [], T0);
    const second = planDerive(mirror, first.upserts.map(fromTaskWrite), T0);
    expect(second.upserts).toHaveLength(0);
  });

  it("updates mirrored fields but honors overrides", () => {
    const existing = planDerive([asg("a1", "not submitted", 24)], [], T0)
      .upserts.map(fromTaskWrite)[0];

    // upstream moved to overdue; user pinned status → status survives unchanged
    const pinned = { ...existing, overrides: { status: true } };
    const mirror = [asg("a1", "overdue", 24)];
    const plan = planDerive(mirror, [pinned], T0);
    expect(plan.upserts).toHaveLength(0); // nothing changed → no write

    // unpinned status follows upstream
    const plan2 = planDerive(mirror, [existing], T0);
    expect(plan2.upserts[0].status).toBe("blocked");
  });

  it("archives tasks whose upstream row was tombstoned", () => {
    const created = planDerive([asg("a1", "not submitted", 24)], [], T0)
      .upserts.map(fromTaskWrite)[0];
    const mirror = [assignmentRow("a1", {}, { deleted: true })];
    const plan = planDerive(mirror, [created], T0);
    expect(plan.archives).toEqual([created.id]);
    expect(plan.upserts).toHaveLength(0);
  });

  it("un-archives resurrected assignments", () => {
    const created = fromTaskWrite(
      planDerive([asg("a1", "not submitted", 24)], [], T0).upserts[0],
    );
    const archived = { ...created, archivedAt: new Date(T0 - 3_600_000) };
    const plan = planDerive([asg("a1", "not submitted", 24)], [archived], T0);
    const resurrected = plan.upserts.find((t) => t.id === created.id);
    expect(resurrected?.archivedAt).toBeNull();
  });

  it("sets completedAt when a task becomes done; clears when it leaves", () => {
    const done = planDerive([asg("a1", "submitted", null)], [], T0);
    expect(done.upserts[0].completedAt).toBe(T0);

    const existing = done.upserts.map(fromTaskWrite)[0];
    const regressed = planDerive([asg("a1", "not submitted", 100)], [existing], T0);
    expect(regressed.upserts[0].completedAt).toBeNull();
    expect(regressed.upserts[0].status).toBe("backlog");
  });

  it("ignores emails, grades, and manual tasks", () => {
    const email = assignmentRow("msg-1", { subject: "hi" });
    email.entityType = "email";
    const grade = assignmentRow("grd-1", { percentage: 90 });
    grade.entityType = "grade";
    const manual = {
      id: "manual-1",
      title: "Buy milk",
      description: null,
      originKind: "manual",
      originExternalId: null,
      originConnectorId: null,
      originEntityType: null,
      status: "backlog" as const,
      priority: 2,
      effortMinutes: null,
      dueAt: null,
      course: null,
      source: "manual",
      overrides: {},
      completedAt: null,
      createdAt: new Date(T0),
      updatedAt: new Date(T0),
      archivedAt: null,
    } as unknown as Task;
    const plan = planDerive([email, grade], [manual], T0);
    expect(plan.upserts).toHaveLength(0);
    expect(plan.archives).toHaveLength(0);
  });

  it("survives malformed payloads without crashing", () => {
    const bad = assignmentRow("a1", { title: 42, status: 7 });
    const plan = planDerive([bad], [], T0);
    expect(plan.upserts).toHaveLength(0);
  });
});
