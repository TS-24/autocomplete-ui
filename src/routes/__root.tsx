import { useEffect, useState } from "react";
import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Cable,
  CalendarDays,
  Columns3,
  LayoutDashboard,
  RefreshCw,
  Settings,
} from "lucide-react";
import { listConnectors } from "../db/repo/connectors.repo";
import { getDataMode } from "../db/repo/settings.repo";
import { getSyncEngine } from "../lib/sync/getEngine";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/kanban", label: "Kanban", icon: Columns3, exact: false },
  { to: "/week", label: "Week", icon: CalendarDays, exact: false },
  { to: "/insights", label: "Insights", icon: BarChart3, exact: false },
  { to: "/sources", label: "Sources", icon: Cable, exact: false },
  { to: "/settings", label: "Settings", icon: Settings, exact: false },
] as const;

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  error: "bg-rose-500",
  disabled: "bg-zinc-600",
};

function TabLink({
  to,
  label,
  icon: Icon,
  exact,
}: (typeof NAV_ITEMS)[number]) {
  return (
    <Link
      to={to}
      activeOptions={exact ? { exact: true } : undefined}
      className="flex items-center gap-2 rounded-t-lg border-t-2 border-transparent px-3.5 py-2 text-xs font-medium text-zinc-400 transition-all hover:bg-zinc-900/80 hover:text-zinc-200"
      activeProps={{
        className: "border-indigo-500 bg-zinc-900 text-zinc-100 font-semibold shadow-sm",
      }}
    >
      <Icon className="size-3.5 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

/** Engine event bus → TanStack Query invalidations (sync-engine.md §6). */
function useEngineWiring() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let unsub: (() => void) | null = null;
    getSyncEngine()
      .then((e) => {
        unsub = e.subscribe((ev) => {
          switch (ev.type) {
            case "connectors":
              void queryClient.invalidateQueries({ queryKey: ["connectors"] });
              break;
            case "mirror":
              void queryClient.invalidateQueries({ queryKey: ["mirror"] });
              break;
            case "activity":
              void queryClient.invalidateQueries({ queryKey: ["activity"] });
              break;
            case "derive":
              void queryClient.invalidateQueries({ queryKey: ["tasks"] });
              void queryClient.invalidateQueries({ queryKey: ["capacity"] });
              break;
            case "health":
              void queryClient.invalidateQueries({ queryKey: ["sources"] });
              break;
          }
        });
      })
      .catch((e) => console.error("engine failed to start", e));
    return () => {
      unsub?.();
    };
  }, [queryClient]);
}

function HeaderStatus() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const { data: connectors } = useQuery({
    queryKey: ["connectors"],
    queryFn: listConnectors,
  });
  const { data: mode } = useQuery({
    queryKey: ["settings", "dataMode"],
    queryFn: getDataMode,
  });

  const syncAll = async () => {
    setSyncing(true);
    try {
      const engine = await getSyncEngine();
      await engine.syncAll();
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {mode === "fixture" && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400 border border-amber-500/20">
          <span className="size-1.5 rounded-full bg-amber-400" />
          demo data
        </span>
      )}
      <div className="flex items-center gap-2">
        {(connectors ?? []).map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-1.5 text-[11px] text-zinc-400"
            title={`${c.name} — ${c.status}`}
          >
            <span
              className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[c.status] ?? "bg-zinc-600"}`}
            />
            <span className="hidden sm:inline text-zinc-400">{c.name}</span>
          </div>
        ))}
        <button
          onClick={() => void syncAll()}
          disabled={syncing}
          title="Sync all now"
          className="ml-1 text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
        </button>
      </div>
    </div>
  );
}

function RootLayout() {
  useEngineWiring();
  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-indigo-500 text-xs font-bold text-white">
              A
            </div>
            <span className="text-sm font-bold tracking-tight text-zinc-100">
              Autocomplete
            </span>
          </div>
          <nav className="flex items-center gap-1 pt-1">
            {NAV_ITEMS.map((item) => (
              <TabLink key={item.to} {...item} />
            ))}
          </nav>
        </div>
        <HeaderStatus />
      </div>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

