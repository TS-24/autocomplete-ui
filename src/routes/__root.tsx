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

function SidebarLink({
  to,
  label,
  icon: Icon,
  exact,
}: (typeof NAV_ITEMS)[number]) {
  return (
    <Link
      to={to}
      activeOptions={exact ? { exact: true } : undefined}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
      activeProps={{ className: "bg-zinc-800 text-zinc-50" }}
    >
      <Icon className="size-4 shrink-0" />
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

function SidebarFooter() {
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
    <div className="border-t border-zinc-800 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-500">Connectors</span>
        <button
          onClick={() => void syncAll()}
          disabled={syncing}
          title="Sync all now"
          className="text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {(connectors ?? []).map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-2 text-xs text-zinc-400"
            title={`${c.name} — ${c.status}`}
          >
            <span
              className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[c.status] ?? "bg-zinc-600"}`}
            />
            <span className="truncate">{c.name}</span>
          </div>
        ))}
        {mode === "fixture" && (
          <span className="mt-1.5 inline-flex items-center gap-1.5 self-start rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-amber-400">
            <span className="size-1.5 rounded-full bg-amber-400" />
            demo data
          </span>
        )}
      </div>
    </div>
  );
}

function RootLayout() {
  useEngineWiring();
  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-2 px-4 py-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500 text-sm font-bold text-white">
            A
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-zinc-100">
              Autocomplete
            </div>
            <div className="text-[11px] text-zinc-500">personal dashboard</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {NAV_ITEMS.map((item) => (
            <SidebarLink key={item.to} {...item} />
          ))}
        </nav>
        <SidebarFooter />
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
