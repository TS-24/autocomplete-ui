import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Cable,
  CalendarDays,
  Columns3,
  LayoutDashboard,
  Settings,
} from "lucide-react";

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

function RootLayout() {
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
        <div className="border-t border-zinc-800 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
            <span className="size-1.5 rounded-full bg-amber-400" />
            demo data
          </span>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
