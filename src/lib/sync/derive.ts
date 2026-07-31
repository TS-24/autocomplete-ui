import type { Task, TaskStatus } from "../../db/schema";
import {
  toTaskWrite,
  type TaskWrite,
} from "../../db/repo/tasks.repo";
import { assignmentPayloadSchema } from "../pks/types";
import type { MirrorRow } from "./sources";

/**
 * Derivation (docs/domain-model.md §2) — assignment mirror rows become
 * tasks. Pure + idempotent: `planDerive` returns only rows that actually
 * changed, so the engine can skip the write entirely.
 *
 * All times are epoch ms (decision D8).
 */

export interface DerivePlan {
  upserts: TaskWrite[];
  /** task ids to archive (upstream row tombstoned). */
  archives: string[];
}

const ASSIGNMENT_STATUS: Record<string, TaskStatus> = {
  submitted: "done",
  completed: "done",
  graded: "done",
  overdue: "blocked",
  late: "blocked",
  "not submitted": "backlog",
  not_started: "backlog",
  started: "in_progress",
};

const taskIdFor = (row: MirrorRow): string =>
  `task-${row.connectorId}-${row.externalId}`;

function sameTask(a: TaskWrite, b: TaskWrite): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.status === b.status &&
    a.dueAt === b.dueAt &&
    a.course === b.course &&
    a.completedAt === b.completedAt &&
    a.archivedAt === b.archivedAt
  );
}

export function planDerive(
  mirror: MirrorRow[],
  existing: Task[],
  now: number,
): DerivePlan {
  const byOrigin = new Map(
    existing
      .filter(
        (t) => t.originKind === "assignment" && t.originExternalId !== null,
      )
      .map((t) => [t.originExternalId as string, toTaskWrite(t)]),
  );

  const upserts: TaskWrite[] = [];
  const archives: string[] = [];
  const seenAlive = new Set<string>();

  for (const row of mirror) {
    if (row.entityType !== "assignment") continue;
    const taskId = taskIdFor(row);
    const prev = byOrigin.get(row.externalId);

    if (row.deletedAt !== null) {
      // Tombstoned upstream → archive the derived task (never delete).
      if (prev && prev.archivedAt === null) archives.push(prev.id);
      continue;
    }
    seenAlive.add(row.externalId);

    const parsed = assignmentPayloadSchema.safeParse(row.payload);
    if (!parsed.success) continue;
    const p = parsed.data;

    const overrides = (prev?.overrides ?? {}) as Record<string, boolean>;
    const statusPinned = !!overrides.status;
    const mapped = ASSIGNMENT_STATUS[p.status] ?? "backlog";
    const due = p.due_date ? p.due_date.getTime() : null;
    let status: TaskStatus = statusPinned
      ? prev!.status
      : mapped === "backlog" && due !== null && due <= now + 48 * 3_600_000 && due > now
        ? "next"
        : mapped;

    const completedAt =
      status === "done"
        ? (prev?.completedAt ?? now)
        : statusPinned
          ? prev?.completedAt ?? null
          : null;

    const next: TaskWrite = {
      id: prev?.id ?? taskId,
      title: overrides.title ? (prev?.title ?? p.title) : p.title,
      description: overrides.description
        ? (prev?.description ?? p.description ?? null)
        : (p.description ?? null),
      originKind: "assignment",
      originExternalId: row.externalId,
      originConnectorId: row.connectorId,
      originEntityType: "assignment",
      status,
      priority: prev?.priority ?? -1,
      effortMinutes: prev?.effortMinutes ?? null,
      dueAt: overrides.dueAt ? (prev?.dueAt ?? null) : due,
      course: overrides.course ? (prev?.course ?? null) : p.course_name || null,
      source: "d2l",
      overrides,
      completedAt,
      archivedAt: prev?.archivedAt ?? null,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };

    if (!prev) {
      upserts.push(next);
    } else if (!sameTask(prev, next)) {
      upserts.push(next);
    }
  }

  // Resurrected upstream row → un-archive the derived task.
  for (const [externalId, t] of byOrigin) {
    if (seenAlive.has(externalId) && t.archivedAt !== null) {
      upserts.push({ ...t, archivedAt: null, updatedAt: now });
    }
  }

  return { upserts, archives };
}
