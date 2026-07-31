import * as taskRepo from "../../db/repo/tasks.repo";
import { chunk, runBatch } from "../../db/sql";
import type { DerivePlan } from "./derive";

/**
 * Apply a derive plan atomically (docs/sync-engine.md §8). Used as the
 * engine's `writeDerive` in the app; tests use in-memory equivalents.
 */
export async function applyDerivePlan(plan: DerivePlan, now: number): Promise<void> {
  if (plan.upserts.length > 0) {
    await taskRepo.upsertTasks(plan.upserts);
  }
  if (plan.archives.length > 0) {
    const stmts = chunk(plan.archives, 500).map(
      (ids) => ({
        sql: `UPDATE tasks SET archived_at = ?1, updated_at = ?1
              WHERE id IN (${ids.map((_, i) => `?${i + 2}`).join(", ")})`,
        params: [now, ...ids] as (string | number | boolean | null)[],
      }),
    );
    await runBatch(stmts);
  }
}
