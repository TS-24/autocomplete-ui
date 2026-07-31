import { getDataMode } from "../../db/repo/settings.repo";
import { FixtureSyncSource } from "../pks/fixtures";
import { ReconcileSyncSource } from "../pks/reconcileSource";
import { SyncEngine, type EngineDeps } from "./engine";
import { sqliteSink } from "./sqliteSink";
import { applyDerivePlan } from "./deriveWrite";

/**
 * App-wide engine singleton. Created lazily so tests can construct engines
 * directly; the UI path always uses `getSyncEngine()`. The promise is cached
 * so StrictMode double-mounts can't double-create.
 */
let enginePromise: Promise<SyncEngine> | null = null;

export function getSyncEngine(): Promise<SyncEngine> {
  enginePromise ??= (async () => {
    const mode = await getDataMode();
    const deps: EngineDeps = {
      source: mode === "live" ? new ReconcileSyncSource() : new FixtureSyncSource(),
      sink: sqliteSink,
      writeDerive: async (plan) => {
        await applyDerivePlan(plan, Date.now());
      },
    };
    return new SyncEngine(deps);
  })();
  return enginePromise;
}

export function resetSyncEngine(): void {
  enginePromise?.then((e) => e.stop()).catch(() => {});
  enginePromise = null;
}
