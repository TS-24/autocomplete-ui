import { and, eq, isNull } from "drizzle-orm";
import { db } from "../client";
import { mirrorEntities, type EntityType, type MirrorEntity } from "../schema";
import { chunk, runBatch } from "../sql";
import type { SnapshotInfo } from "../../lib/sync/sources";

/**
 * The sync surface (docs/sync-engine.md §3). Written ONLY by the sync engine.
 * Upserts are atomic via `sql_batch`; tombstones, never deletes.
 */

/** One page of snapshots, one atomic transaction, version-guarded upsert. */
export async function upsertSnapshots(
  items: SnapshotInfo[],
  now: number,
): Promise<void> {
  const stmts = items.map((s, i) => ({
    sql: `
      INSERT INTO mirror_entities (id, connector_id, entity_type, external_id,
                                   payload, version, updated_at, created_at, deleted_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL)
      ON CONFLICT(connector_id, entity_type, external_id) DO UPDATE SET
        payload = excluded.payload,
        version = excluded.version,
        updated_at = excluded.updated_at,
        deleted_at = NULL
      WHERE excluded.version > mirror_entities.version
         OR mirror_entities.deleted_at IS NOT NULL`,
    params: [
      `mir-${s.connectorId}-${s.entityType}-${s.externalId}-${i}`,
      s.connectorId,
      s.entityType,
      s.externalId,
      sqlJson(s.payload),
      s.version,
      s.updatedAt,
      now,
    ] as (string | number | boolean | null)[],
  }));
  await runBatch(stmts);
}

function sqlJson(v: unknown): string {
  return JSON.stringify(v);
}

export async function listMirror(opts: {
  entityType?: EntityType;
  connectorId?: string;
  includeDeleted?: boolean;
}): Promise<MirrorEntity[]> {
  const where = and(
    opts.entityType ? eq(mirrorEntities.entityType, opts.entityType) : undefined,
    opts.connectorId ? eq(mirrorEntities.connectorId, opts.connectorId) : undefined,
    opts.includeDeleted ? undefined : isNull(mirrorEntities.deletedAt),
  );
  return db.query.mirrorEntities.findMany({
    where,
    orderBy: (m, { desc }) => [desc(m.updatedAt)],
  });
}

/** Unread email snapshots (payload.is_read === false), newest first. */
export async function listUnreadEmails(limit = 10): Promise<MirrorEntity[]> {
  const rows = await db.query.mirrorEntities.findMany({
    where: and(
      eq(mirrorEntities.entityType, "email"),
      isNull(mirrorEntities.deletedAt),
    ),
    orderBy: (m, { desc }) => [desc(m.updatedAt)],
    limit: Math.max(limit * 4, 50), // fetch generously, filter in TS (portable SQL)
  });
  return rows
    .filter((r) => (r.payload as Record<string, unknown>)?.is_read === false)
    .slice(0, limit);
}

export async function listMirrorByConnector(): Promise<
  Record<string, number>
> {
  const rows = await db
    .select({ connectorId: mirrorEntities.connectorId })
    .from(mirrorEntities)
    .where(isNull(mirrorEntities.deletedAt));
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.connectorId] = (counts[r.connectorId] ?? 0) + 1;
  return counts;
}

/** All external ids for one connector/entity, for the full-reconcile tombstone pass. */
export async function collectExternalIds(
  connectorId: string,
  entityType: EntityType,
): Promise<Set<string>> {
  const rows = await db
    .select({ externalId: mirrorEntities.externalId })
    .from(mirrorEntities)
    .where(
      and(
        eq(mirrorEntities.connectorId, connectorId),
        eq(mirrorEntities.entityType, entityType),
      ),
    );
  return new Set(rows.map((r) => r.externalId));
}

/** Tombstone mirror rows not seen in the last full reconcile (never deletes). */
export async function tombstoneMirror(
  connectorId: string,
  entityType: EntityType,
  seen: Set<string>,
  now: number,
): Promise<void> {
  const stmts: { sql: string; params: (string | number | boolean | null)[] }[] = [];
  for (const ids of chunk([...seen], 400)) {
    stmts.push({
      sql: `UPDATE mirror_entities SET deleted_at = ?1
            WHERE connector_id = ?2 AND entity_type = ?3 AND deleted_at IS NULL
              AND external_id NOT IN (${ids.map((_, i) => `?${i + 4}`).join(", ")})`,
      params: [now, connectorId, entityType, ...ids],
    });
  }
  if (stmts.length === 0) {
    stmts.push({
      sql: `UPDATE mirror_entities SET deleted_at = ?1
            WHERE connector_id = ?2 AND entity_type = ?3 AND deleted_at IS NULL`,
      params: [now, connectorId, entityType],
    });
  }
  await runBatch(stmts);
}
