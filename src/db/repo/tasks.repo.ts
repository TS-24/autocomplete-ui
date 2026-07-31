import { desc, eq, isNull } from "drizzle-orm";
import { db } from "../client";
import {
  tasks,
  type OriginKind,
  type Task,
  type TaskStatus,
} from "../schema";
import { runBatch } from "../sql";

/**
 * The user planning layer. Written by derive() and by user actions
 * (docs/domain-model.md §4 — overrides pin user fields).
 */

/** Task row in epoch-ms form — what the engine and SQL writes actually use. */
export interface TaskWrite {
  id: string;
  title: string;
  description: string | null;
  originKind: OriginKind | null;
  originExternalId: string | null;
  originConnectorId: string | null;
  originEntityType: string | null;
  status: TaskStatus;
  priority: number;
  effortMinutes: number | null;
  dueAt: number | null;
  course: string | null;
  source: string | null;
  overrides: Record<string, boolean>;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

/** Drizzle Task (Date columns) → epoch-ms write shape. */
export function toTaskWrite(t: Task): TaskWrite {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    originKind: t.originKind,
    originExternalId: t.originExternalId,
    originConnectorId: t.originConnectorId,
    originEntityType: t.originEntityType,
    status: t.status,
    priority: t.priority,
    effortMinutes: t.effortMinutes,
    dueAt: t.dueAt ? t.dueAt.getTime() : null,
    course: t.course,
    source: t.source,
    overrides: (t.overrides ?? {}) as Record<string, boolean>,
    completedAt: t.completedAt ? t.completedAt.getTime() : null,
    createdAt: t.createdAt.getTime(),
    updatedAt: t.updatedAt.getTime(),
    archivedAt: t.archivedAt ? t.archivedAt.getTime() : null,
  };
}

/** Inverse of `toTaskWrite` — epoch-ms write shape back to a Drizzle Task. */
export function fromTaskWrite(w: TaskWrite): Task {
  return {
    id: w.id,
    title: w.title,
    description: w.description,
    originKind: w.originKind,
    originExternalId: w.originExternalId,
    originConnectorId: w.originConnectorId,
    originEntityType: w.originEntityType,
    status: w.status,
    priority: w.priority,
    effortMinutes: w.effortMinutes,
    dueAt: w.dueAt === null ? null : new Date(w.dueAt),
    course: w.course,
    source: w.source,
    overrides: w.overrides,
    completedAt: w.completedAt === null ? null : new Date(w.completedAt),
    createdAt: new Date(w.createdAt),
    updatedAt: new Date(w.updatedAt),
    archivedAt: w.archivedAt === null ? null : new Date(w.archivedAt),
  };
}

export async function listTasks(opts: {
  includeArchived?: boolean;
} = {}): Promise<Task[]> {
  return db.query.tasks.findMany({
    where: opts.includeArchived ? undefined : isNull(tasks.archivedAt),
    orderBy: [desc(tasks.updatedAt)],
  });
}

export async function getTask(id: string): Promise<Task | null> {
  return (await db.query.tasks.findFirst({ where: eq(tasks.id, id) })) ?? null;
}

const UPSERT_STMT = `
  INSERT INTO tasks (id, title, description, origin_kind, origin_external_id,
                     origin_connector_id, origin_entity_type, status, priority,
                     effort_minutes, due_at, course, source, overrides,
                     completed_at, created_at, updated_at, archived_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    description = excluded.description,
    origin_kind = excluded.origin_kind,
    origin_external_id = excluded.origin_external_id,
    origin_connector_id = excluded.origin_connector_id,
    origin_entity_type = excluded.origin_entity_type,
    status = excluded.status,
    due_at = excluded.due_at,
    course = excluded.course,
    source = excluded.source,
    completed_at = excluded.completed_at,
    updated_at = excluded.updated_at,
    archived_at = excluded.archived_at
`;

/** derive() and user edits write whole rows atomically (sync-engine.md §8). */
export async function upsertTasks(rows: TaskWrite[]): Promise<void> {
  const stmts = rows.map((t) => ({
    sql: UPSERT_STMT,
    params: [
      t.id,
      t.title,
      t.description,
      t.originKind,
      t.originExternalId,
      t.originConnectorId,
      t.originEntityType,
      t.status,
      t.priority,
      t.effortMinutes,
      t.dueAt,
      t.course,
      t.source,
      JSON.stringify(t.overrides),
      t.completedAt,
      t.createdAt,
      t.updatedAt,
      t.archivedAt,
    ] as (string | number | boolean | null)[],
  }));
  await runBatch(stmts);
}

/** User edit — also records the pinned field in `overrides` (domain-model §4). */
export async function updateTask(
  id: string,
  patch: Partial<
    Pick<Task, "title" | "description" | "status" | "priority" | "effortMinutes" | "dueAt" | "course">
  >,
  pinnedFields: string[],
): Promise<void> {
  const existing = await getTask(id);
  if (!existing) throw new Error(`task ${id} not found`);

  const overrides: Record<string, boolean> = {
    ...((existing.overrides ?? {}) as Record<string, boolean>),
  };
  for (const f of pinnedFields) overrides[f] = true;

  const next: Task = { ...existing, ...patch, overrides };
  await upsertTasks([toTaskWrite(next)]);
}
