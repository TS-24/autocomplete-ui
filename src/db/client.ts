import { drizzle } from "drizzle-orm/sqlite-proxy";
import Database from "@tauri-apps/plugin-sql";
import * as schema from "./schema";

export const DB_PATH = "sqlite:autocomplete-ui.db";

let conn: Database | null = null;

async function getConn(): Promise<Database> {
  if (!conn) {
    conn = await Database.load(DB_PATH);
  }
  return conn;
}

/** Cheap statement-kind check — `run` vs `all` for the proxy callback. */
const isSelect = (sql: string) =>
  /^\s*(select|pragma|with)\b/i.test(sql);

/**
 * Drizzle over tauri-plugin-sql via the sqlite-proxy adapter.
 *
 * - `select`-type statements: rows are objects keyed by column → returned as
 *   array-of-arrays, which the proxy expects.
 * - writes: executed; rows returned are empty (writes go through `run`).
 * - Multi-statement atomic writes (page upserts) bypass this and use the Rust
 *   `sql_batch` command instead (see docs/sync-engine.md §7).
 */
export const db = drizzle<typeof schema>(
  async (sql, params) => {
    const c = await getConn();
    if (isSelect(sql)) {
      const rows = (await c.select(sql, params as unknown[])) as Record<
        string,
        unknown
      >[];
      return { rows: rows.map((r) => Object.values(r)) };
    }
    await c.execute(sql, params as unknown[]);
    return { rows: [] };
  },
  { schema, logger: false },
);
