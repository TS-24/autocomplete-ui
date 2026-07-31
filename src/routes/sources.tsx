import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Cable,
  CheckCircle2,
  Clock,
  Inbox,
  Mail,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { listConnectors } from "../db/repo/connectors.repo";
import { countEvents } from "../db/repo/activity.repo";
import { listMirrorByConnector } from "../db/repo/mirror.repo";
import { getDataMode, setDataMode, type DataMode } from "../db/repo/settings.repo";
import { getSyncEngine } from "../lib/sync/getEngine";
import { hasApiKey } from "../lib/pks/client";
import { checkHealth } from "../lib/pks/client";
import { relativeTime } from "../lib/time";
import type { Connector } from "../db/schema";

export const Route = createFileRoute("/sources")({
  component: Sources,
});

const TYPE_ICON: Record<string, typeof Mail> = {
  gmail: Mail,
  google_calendar: Clock,
  d2l: Inbox,
};

const STATUS_TONE: Record<string, "ok" | "danger" | "default"> = {
  active: "ok",
  error: "danger",
  disabled: "default",
};

const SYNC_TONE: Record<string, "ok" | "danger" | "warn" | "default"> = {
  success: "ok",
  failed: "danger",
  running: "warn",
  pending: "warn",
};

function SyncNowButton({ connectorId }: { connectorId: string }) {
  const queryClient = useQueryClient();
  const { data: running } = useQuery({
    queryKey: ["sources", "syncing", connectorId],
    queryFn: async () => {
      const engine = await getSyncEngine();
      return engine.isSyncing(connectorId);
    },
    refetchInterval: 2_000,
  });

  const sync = async () => {
    const engine = await getSyncEngine();
    await engine.syncNow(connectorId);
    void queryClient.invalidateQueries({ queryKey: ["connectors"] });
    void queryClient.invalidateQueries({ queryKey: ["mirror"] });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
    void queryClient.invalidateQueries({ queryKey: ["sources"] });
  };

  return (
    <button
      onClick={() => void sync()}
      disabled={running}
      className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RefreshCw className={`size-3 ${running ? "animate-spin" : ""}`} />
      {running ? "Syncing…" : "Sync now"}
    </button>
  );
}

function ConnectorCard({ connector }: { connector: Connector }) {
  const Icon = TYPE_ICON[connector.type] ?? Cable;
  const { data: counts } = useQuery({
    queryKey: ["mirror", "counts", connector.id],
    queryFn: async () => {
      const all = await listMirrorByConnector();
      return all[connector.id] ?? 0;
    },
  });

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
            <Icon className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-100">
                {connector.name}
              </h3>
              <Badge tone={STATUS_TONE[connector.status] ?? "default"}>
                {connector.status}
              </Badge>
              {connector.errorCount > 0 && (
                <Badge tone="danger">{connector.errorCount} errors</Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {connector.type}
              {counts !== undefined && counts > 0
                ? ` · ${counts} items mirrored`
                : ""}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Last sync:{" "}
              {connector.lastSyncAt
                ? relativeTime(connector.lastSyncAt.getTime(), Date.now())
                : "never"}
              {connector.lastSyncStatus && (
                <Badge
                  tone={SYNC_TONE[connector.lastSyncStatus] ?? "default"}
                  className="ml-2"
                >
                  {connector.lastSyncStatus}
                </Badge>
              )}
            </p>
          </div>
        </div>
        <SyncNowButton connectorId={connector.id} />
      </div>
    </Card>
  );
}

function ConnectivitySection() {
  const { data: health, refetch, isFetching } = useQuery({
    queryKey: ["sources", "health"],
    queryFn: checkHealth,
    refetchInterval: 60_000,
  });

  return (
    <Card
      title="Backend connectivity"
      description="GET /health on the PKS API. Fixtures emulate a healthy backend."
    >
      <div className="flex items-center gap-3">
        {health?.ok ? (
          <CheckCircle2 className="size-5 text-emerald-500" />
        ) : (
          <XCircle className="size-5 text-rose-500" />
        )}
        <div className="flex-1 text-sm text-zinc-300">
          {health && health.ok
            ? `PKS API reachable (v${health.version ?? "?"})`
            : `Unreachable — ${health?.detail ?? "no response"}`}
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} />
          Re-check
        </button>
      </div>
    </Card>
  );
}

function DataModeToggle() {
  const queryClient = useQueryClient();
  const { data: mode } = useQuery({
    queryKey: ["settings", "dataMode"],
    queryFn: getDataMode,
  });
  const { data: keyPresent } = useQuery({
    queryKey: ["settings", "hasApiKey"],
    queryFn: hasApiKey,
  });

  const switchMode = async (next: DataMode) => {
    if (next === "live" && !keyPresent) return;
    await setDataMode(next);
    queryClient.setQueryData(["settings", "dataMode"], next);
    queryClient.invalidateQueries({ queryKey: ["connectors"] });
    queryClient.invalidateQueries({ queryKey: ["mirror"] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
  };

  return (
    <Card
      title="Data mode"
      description="Demo data is built in; live mode requires the PKS API key (Settings → Connection)."
    >
      <div className="flex items-center gap-2">
        {(["fixture", "live"] as const).map((m) => (
          <button
            key={m}
            onClick={() => void switchMode(m)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === m
                ? "bg-indigo-500 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {m === "fixture" ? "Demo data" : "Live API"}
          </button>
        ))}
        {mode === "live" && !keyPresent && (
          <span className="text-xs text-amber-400">
            Store an API key in Settings first.
          </span>
        )}
      </div>
    </Card>
  );
}

function Sources() {
  const { data: connectors, isLoading, isError, refetch } = useQuery({
    queryKey: ["connectors"],
    queryFn: listConnectors,
  });
  const { data: eventCount } = useQuery({
    queryKey: ["activity", "count"],
    queryFn: countEvents,
  });

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-50">
            <Cable className="size-6 text-zinc-400" />
            Sources
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Connectors feeding the mirror{eventCount ? ` · ${eventCount} events` : ""}.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-6">
        <ConnectivitySection />
        <DataModeToggle />

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-zinc-200">Connectors</h2>
          {isLoading && (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/60"
                />
              ))}
            </div>
          )}
          {isError && (
            <div className="rounded-xl border border-rose-800 bg-rose-500/10 p-4 text-sm text-rose-300">
              Failed to load connectors.{" "}
              <button onClick={() => void refetch()} className="underline">
                Retry
              </button>
            </div>
          )}
          {connectors?.length === 0 && (
            <p className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-500">
              No connectors yet. In live mode they come from the PKS API; in
              demo mode they appear after the first sync.
            </p>
          )}
          {(connectors ?? []).map((c) => (
            <ConnectorCard key={c.id} connector={c} />
          ))}
        </section>
      </div>
    </div>
  );
}
