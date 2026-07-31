import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { syncState, type EntityType } from "../schema";
import { runBatch } from "../sql";

/**
 * Watermarks + full-reconcile bookkeeping (docs/sync-engine.md §3).
 * Engine-internal, never user data.
 */

function stateId(connectorId: string, entityType: EntityType): string {
  return `${connectorId}:${entityType}`;
}

export async function getWatermark(
  connectorId: string,
  entityType: EntityType,
): Promise<number> {
  const row = await db.query.syncState.findFirst({
    where: and(
      eq(syncState.connectorId, connectorId),
      eq(syncState.entityType, entityType),
    ),
  });
  const wm = row?.watermark;
  if (wm === null || wm === undefined) return 0;
  return typeof wm === "number" ? wm : wm.getTime();
}

const UPSERT_STMT = `
  INSERT INTO sync_state (id, connector_id, entity_type, watermark, last_full_reconcile_at, updated_at)
  VALUES (?1, ?2, ?3, ?4, NULL, ?5)
  ON CONFLICT(id) DO UPDATE SET
    watermark = excluded.watermark,
    updated_at = excluded.updated_at
`;

/** Monotone: only ever advances (docs/sync-engine.md §4.6). */
export async function setWatermark(
  connectorId: string,
  entityType: EntityType,
  watermark: number,
  now: number,
): Promise<void> {
  const existing = await getWatermark(connectorId, entityType);
  const next = Math.max(existing, watermark);
  await runBatch([
    {
      sql: UPSERT_STMT,
      params: [stateId(connectorId, entityType), connectorId, entityType, next, now],
    },
  ]);
}

export async function markFullReconcile(
  connectorId: string,
  entityType: EntityType,
  now: number,
): Promise<void> {
  await runBatch([
    {
      sql: `INSERT INTO sync_state (id, connector_id, entity_type, watermark, last_full_reconcile_at, updated_at)
            VALUES (?1, ?2, ?3, 0, ?4, ?5)
            ON CONFLICT(id) DO UPDATE SET
              last_full_reconcile_at = excluded.last_full_reconcile_at,
              updated_at = excluded.updated_at`,
      params: [stateId(connectorId, entityType), connectorId, entityType, now, now],
    },
  ]);
}
