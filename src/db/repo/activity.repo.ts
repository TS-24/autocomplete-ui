import { count, desc, lt } from "drizzle-orm";
import { db } from "../client";
import { activityEvents, type ActivityEvent } from "../schema";
import { runBatch } from "../sql";
import type { ActivityEvent as SyncEvent } from "../../lib/sync/sources";

/**
 * Tier-3 feed — display only, never derived from (docs/api-contract.md §4.3).
 */

const INSERT_STMT = `
  INSERT OR IGNORE INTO activity_events (id, source, type, timestamp, payload, created_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6)
`;

export async function upsertActivity(
  events: SyncEvent[],
  now: number,
): Promise<void> {
  const stmts = events.map((e) => ({
    sql: INSERT_STMT,
    params: [
      e.id,
      e.source,
      e.type,
      e.timestamp,
      e.payload === null || e.payload === undefined ? null : JSON.stringify(e.payload),
      now,
    ] as (string | number | boolean | null)[],
  }));
  await runBatch(stmts);
}

export async function listRecentEvents(
  limit = 20,
): Promise<ActivityEvent[]> {
  return db.query.activityEvents.findMany({
    orderBy: [desc(activityEvents.timestamp)],
    limit,
  });
}

export async function countEvents(): Promise<number> {
  const rows = await db.select({ n: count() }).from(activityEvents);
  return rows[0]?.n ?? 0;
}

/** Keep the feed bounded: drop rows older than `before` (epoch ms). */
export async function pruneActivityEvents(before: number): Promise<void> {
  await db.delete(activityEvents).where(lt(activityEvents.createdAt, new Date(before)));
}
