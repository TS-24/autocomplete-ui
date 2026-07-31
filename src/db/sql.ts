import { invoke } from "@tauri-apps/api/core";

/**
 * The Rust `sql_batch` command: executes statements atomically in ONE
 * transaction on the Rust pool (docs/sync-engine.md §7). The Drizzle
 * sqlite-proxy cannot run `db.transaction()`, so multi-statement writes
 * (mirror page upserts, derive passes) go through here.
 *
 * Params must be JSON-safe: numbers, strings, booleans, null.
 * SQLite booleans are 0/1; dates are epoch ms numbers.
 */

export interface BatchStatement {
  sql: string;
  params: (string | number | boolean | null)[];
}

export async function runBatch(
  statements: BatchStatement[],
): Promise<number> {
  if (statements.length === 0) return 0;
  const result = await invoke<{ rows_affected: number }>("sql_batch", {
    statements,
  });
  return result.rows_affected;
}

/** Chunk an array so parameter-placeholder limits (999) are never hit. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
