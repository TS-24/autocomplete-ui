import Database from "@tauri-apps/plugin-sql";
import { DB_PATH } from "./client";

interface MigrationFile {
  /** path in the migrations dir, e.g. "0000_silent_shape.sql" */
  name: string;
  sql: string;
}

/**
 * All .sql files under src/db/migrations, inlined at build time.
 * This is the Vite-only trick that makes Drizzle migrations work in a
 * webview (the stock migrator needs Node's fs at runtime).
 */
const migrationFiles: MigrationFile[] = Object.entries(
  import.meta.glob<string>("./migrations/*.sql", {
    eager: true,
    query: "raw",
    import: "default",
  }),
)
  .map(([path, sql]) => ({
    name: path.split("/").pop() ?? path,
    sql,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Applies pending migrations; safe to run on every boot. */
export async function runMigrations(): Promise<void> {
  const conn = await Database.load(DB_PATH);
  await conn.execute(
    "CREATE TABLE IF NOT EXISTS __drizzle_migrations (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
      "hash TEXT NOT NULL UNIQUE, " +
      "created_at INTEGER)",
  );
  const applied = (await conn.select<{ hash: string }[]>(
    "SELECT hash FROM __drizzle_migrations",
  )) as { hash: string }[];
  const appliedSet = new Set(applied.map((r) => r.hash));

  for (const file of migrationFiles) {
    const hash = await sha256(file.sql);
    if (appliedSet.has(hash)) continue;
    const statements = file.sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await conn.execute(stmt);
    }
    await conn.execute(
      "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      [hash, Date.now()],
    );
  }
}
