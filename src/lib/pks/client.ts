import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { getBaseUrl } from "../../db/repo/settings.repo";

/**
 * Thin wrapper over the Rust `pks_fetch` command. The API key lives in the OS
 * keychain and is injected by Rust — it never crosses the webview boundary
 * (docs/architecture.md §1).
 */

export class PksError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PksError";
  }
}

export interface FetchOptions {
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  method?: "GET" | "POST";
}

export async function pksFetch<T>(schema: z.ZodType<T>, opts: FetchOptions): Promise<T> {
  const baseUrl = await getBaseUrl();
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === null) continue;
    query[k] = String(v);
  }
  let raw: unknown;
  try {
    raw = await invoke("pks_fetch", {
      baseUrl,
      path: opts.path,
      query,
      method: opts.method ?? "GET",
    });
  } catch (e) {
    throw new PksError(String(e));
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new PksError(`Unexpected response from ${opts.path}: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function hasApiKey(): Promise<boolean> {
  return invoke<boolean>("has_api_key");
}

export async function storeApiKey(key: string): Promise<void> {
  await invoke("set_api_key", { key });
}

export async function clearApiKey(): Promise<void> {
  await invoke("clear_api_key");
}

export type HealthResult = { ok: boolean; version?: string; detail?: string };

export async function checkHealth(): Promise<HealthResult> {
  try {
    const health = await pksFetch(
      z.object({ status: z.string(), version: z.string().optional() }),
      { path: "/health" },
    );
    return { ok: health.status === "ok", version: health.version };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
