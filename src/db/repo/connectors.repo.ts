import { eq, isNull } from "drizzle-orm";
import { db } from "../client";
import { connectors, type Connector } from "../schema";
import { chunk, runBatch } from "../sql";
import type { ConnectorInfo } from "../../lib/sync/sources";

/**
 * Mirror of `GET /connectors`. Written ONLY by the sync engine
 * (docs/database-schema.md §2).
 */

export async function listConnectors(): Promise<Connector[]> {
  return db.query.connectors.findMany({
    where: isNull(connectors.deletedAt),
    orderBy: (c, { asc }) => [asc(c.name)],
  });
}

export async function getConnector(id: string): Promise<Connector | null> {
  return (
    (await db.query.connectors.findFirst({ where: eq(connectors.id, id) })) ?? null
  );
}

const UPSERT_STMT = () => `
  INSERT INTO connectors (id, type, name, status, last_sync_at, last_sync_status,
                          error_count, updated_at, deleted_at, synced_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9)
  ON CONFLICT(id) DO UPDATE SET
    type = excluded.type,
    name = excluded.name,
    status = excluded.status,
    last_sync_at = excluded.last_sync_at,
    last_sync_status = excluded.last_sync_status,
    error_count = excluded.error_count,
    updated_at = excluded.updated_at,
    deleted_at = NULL,
    synced_at = excluded.synced_at
`;

/** Always called on tier 1 — keeps display fresh and clears tombstones. */
export async function upsertConnectors(
  upstream: ConnectorInfo[],
  now: number,
): Promise<void> {
  const stmts = upstream.map((c) => ({
    sql: UPSERT_STMT(),
    params: [
      c.id,
      c.type,
      c.name,
      c.status,
      c.lastSyncAt,
      c.lastSyncStatus,
      c.errorCount,
      c.updatedAt ?? now,
      now,
    ] as (string | number | boolean | null)[],
  }));
  await runBatch(stmts);
}

/** Mark rows deleted for connector ids that vanished upstream. */
export async function tombstoneConnectors(
  liveIds: string[],
  now: number,
): Promise<void> {
  const stmts = chunk(liveIds, 500).map(
    (ids) => ({
      sql: `UPDATE connectors SET deleted_at = ?1
            WHERE deleted_at IS NULL AND id NOT IN (${ids.map((_, i) => `?${i + 2}`).join(", ")})`,
      params: [now, ...ids] as (string | number | boolean | null)[],
    }),
  );
  await runBatch(stmts);
}
