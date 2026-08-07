import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  GraduationCap,
  Mail,
  Calendar,
  History,
  ListTodo,
} from "lucide-react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { listTasks } from "../db/repo/tasks.repo";
import {
  getEffortSettings,
  listCapacity,
} from "../db/repo/settings.repo";
import {
  listCommitments,
  listGrades,
} from "../db/repo/mirror.repo";
import { listRecentEvents } from "../db/repo/activity.repo";
import type { Task } from "../db/schema";
import { schedule } from "../lib/schedule/capacity";
import { rankTasks, gradeWeightByCourse, type RankableTask } from "../lib/schedule/rank";
import { DAY_MS, formatRelative, relativeTime, startOfDay } from "../lib/time";
import { effectiveEffort, type EffortSettings } from "../lib/schedule/effort";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const toSchedulable = (t: Task): RankableTask => ({
  id: t.id,
  title: t.title,
  status: t.status,
  priority: t.priority,
  dueAt: t.dueAt ? t.dueAt.getTime() : null,
  effortMinutes: t.effortMinutes,
  course: t.course,
  source: t.source,
  archivedAt: t.archivedAt ? t.archivedAt.getTime() : null,
});

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-800/60 ${className}`} />;
}

function NextCard({ task, effort }: { task: Task; effort: number }) {
  const overdue = task.dueAt !== null && task.dueAt.getTime() < startOfDay(Date.now());
  return (
    <Link
      to="/kanban"
      className="group flex flex-col gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 transition-colors hover:border-zinc-700"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm text-zinc-100">{task.title}</span>
        {task.course && (
          <Badge tone="accent" className="shrink-0">
            {task.course}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-zinc-500">~{effort >= 60 ? `${Math.round(effort / 60)}h` : `${effort}m`}</span>
        {task.dueAt && (
          <Badge tone={overdue ? "danger" : "default"}>
            {formatRelative(task.dueAt.getTime())}
          </Badge>
        )}
        <ArrowRight className="size-3 text-zinc-600 transition-colors group-hover:text-indigo-400" />
      </div>
    </Link>
  );
}

function NextUp({
  tasks,
  effortSettings,
  gradeWeights,
}: {
  tasks: Task[];
  effortSettings: EffortSettings;
  gradeWeights: Record<string, number>;
}) {
  const ranked = rankTasks(tasks.map(toSchedulable), { effortSettings, gradeWeights }).slice(0, 5);
  if (ranked.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No open tasks — create one on the Kanban board.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {ranked.map(({ task, why }) => (
        <div key={task.id} className="flex flex-col gap-1">
          <NextCard
            task={tasks.find((t) => t.id === task.id)!}
            effort={effectiveEffort(task, effortSettings)}
          />
          {why.length > 0 && (
            <div className="flex flex-wrap gap-1 pl-1">
              {why.slice(0, 3).map((w) => (
                <span
                  key={w}
                  className="rounded-full bg-zinc-800/70 px-2 py-0.5 text-[10px] text-zinc-400"
                >
                  {w}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AtRisk({ tasks, flags, now }: { tasks: Task[]; flags: Record<string, "at-risk" | "ok">; now: number }) {
  const atRisk = tasks.filter((t) => flags[t.id] === "at-risk" && t.status !== "done");
  if (atRisk.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Nothing at risk — everything fits before its due date.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {atRisk.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-2.5"
        >
          <AlertTriangle className="size-3.5 shrink-0 text-rose-400" />
          <span className="flex-1 text-sm text-zinc-200">{t.title}</span>
          <span className="text-[11px] text-rose-300">
            {t.dueAt ? `due ${formatRelative(t.dueAt.getTime(), now)}` : "no due date"} — won't fit
          </span>
        </div>
      ))}
    </div>
  );
}

interface WeekDay {
  day: number;
  label: string;
  cap: number;
  committed: number;
  load: number;
  pct: number;
  isToday: boolean;
}

function WeekBars({ days, load, committed, capMinutes, busyPct, today }: {
  days: number[];
  load: Record<number, number>;
  committed: Record<number, number>;
  capMinutes: Record<number, number>;
  busyPct: Record<number, number>;
  today: number;
}) {
  const rows: WeekDay[] = days.map((d) => ({
    day: d,
    label: DAY_LABELS[new Date(d).getDay()],
    cap: capMinutes[d] ?? 0,
    committed: committed[d] ?? 0,
    load: load[d] ?? 0,
    pct: busyPct[d] ?? 0,
    isToday: d === today,
  }));
  const maxCombined = Math.max(1, ...rows.map((r) => r.committed + r.load));
  const maxCap = Math.max(1, ...rows.map((r) => r.cap));

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const combined = r.committed + r.load;
        const totalWidth = Math.min(100, (combined / maxCombined) * 100);
        const committedWidth = totalWidth > 0 ? (r.committed / combined) * totalWidth : 0;
        const loadWidth = totalWidth > 0 ? totalWidth - committedWidth : 0;
        const color =
          r.pct > 100 ? "bg-rose-500" : r.pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
        const label =
          r.pct === Infinity
            ? "∞"
            : combined === 0
              ? "—"
              : `${Math.round(r.pct)}%`;
        return (
          <div key={r.day} className="flex items-center gap-3">
            <span
              className={`w-9 text-xs ${r.isToday ? "font-semibold text-indigo-300" : "text-zinc-500"}`}
            >
              {r.label}
            </span>
            <div className="relative h-4 flex-1 overflow-hidden rounded bg-zinc-800/70">
              {r.pct > 0 && (
                <div className="absolute inset-y-0 left-0 flex" style={{ width: `${totalWidth}%` }}>
                  {committedWidth > 0 && (
                    <div className="h-full bg-indigo-500/70" style={{ width: `${(committedWidth / totalWidth) * 100}%` }} />
                  )}
                  {loadWidth > 0 && (
                    <div className={`h-full ${color}`} style={{ width: `${(loadWidth / totalWidth) * 100}%` }} />
                  )}
                </div>
              )}
              {r.isToday && (
                <div className="absolute inset-0 rounded ring-1 ring-inset ring-indigo-400/50" />
              )}
            </div>
            <span className={`w-10 text-right text-[11px] tabular-nums ${r.pct > 100 ? "text-rose-400" : r.pct >= 80 ? "text-amber-400" : "text-zinc-500"}`}>
              {label}
            </span>
          </div>
        );
      })}
      <div className="mt-1 flex items-center gap-3 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-indigo-500/70" /> commitments
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-emerald-500" /> tasks
        </span>
        <span className="ml-auto">
          {Math.max(0, Math.round(maxCap / 60))}h max day
        </span>
      </div>
    </div>
  );
}

function Dashboard() {
  const now = Date.now();
  const today = startOfDay(now);

  const { data: tasks, isLoading: tasksLoading, isError: tasksError, refetch: refetchTasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => listTasks(),
  });
  const { data: effortSettings } = useQuery({
    queryKey: ["settings", "effortDefaults"],
    queryFn: getEffortSettings,
  });
  const { data: gradeWeights } = useQuery({
    queryKey: ["grades"],
    queryFn: async () => gradeWeightByCourse(await listGrades()),
  });
  const { data: sched, isLoading: schedLoading, isError: schedError, refetch: refetchSchedule } = useQuery({
    queryKey: ["capacity"],
    queryFn: async () => {
      const [allTasks, commitments, profile, effort] = await Promise.all([
        listTasks(),
        listCommitments(today, today + 7 * DAY_MS),
        listCapacity(),
        getEffortSettings(),
      ]);
      return schedule(
        allTasks.map(toSchedulable),
        commitments,
        profile,
        effort,
        now,
      );
    },
  });
  const { data: activity } = useQuery({
    queryKey: ["activity"],
    queryFn: () => listRecentEvents(8),
  });
  const { data: todayCommitments } = useQuery({
    queryKey: ["commitments", "today"],
    queryFn: () => listCommitments(today, today + DAY_MS),
  });

  const loading = tasksLoading || schedLoading;
  const error = tasksError || schedError;

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-zinc-400">Couldn't load the dashboard.</p>
        <Button variant="secondary" onClick={() => { void refetchTasks(); void refetchSchedule(); }}>
          Retry
        </Button>
      </div>
    );
  }

  const hourRange = (start: number, end: number) =>
    `${new Date(start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–${new Date(end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-8 py-6">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">
            What to work on next, what's at risk, and how busy this week will be.
          </p>
        </div>
        <span className="text-xs text-zinc-500">
          {new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        </span>
      </header>

      {loading ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card title="Work on this next" description="Ranked by due date, priority, grade weight, and effort — with the reasons.">
              <NextUp tasks={tasks ?? []} effortSettings={effortSettings ?? { effortDefaults: {}, effortCourseOverrides: {} }} gradeWeights={gradeWeights ?? {}} />
            </Card>

            <Card title="At risk" description="Open tasks whose effort doesn't fit before their due date.">
              <AtRisk tasks={tasks ?? []} flags={sched?.flags ?? {}} now={now} />
            </Card>

            <Card title="This week" description="Capacity vs commitments and scheduled task load, next 7 days.">
              <WeekBars
                days={sched?.days ?? []}
                load={sched?.load ?? {}}
                committed={sched?.committed ?? {}}
                capMinutes={sched?.capMinutes ?? {}}
                busyPct={sched?.busyPct ?? {}}
                today={today}
              />
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card title="Today's commitments" description="Calendar blocks for today.">
              {todayCommitments && todayCommitments.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {todayCommitments.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <CalendarDays className="size-3.5 shrink-0 text-indigo-400" />
                      <span className="flex-1 text-zinc-200">{c.title}</span>
                      <span className="text-[11px] tabular-nums text-zinc-500">
                        {hourRange(c.start, c.end)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">No commitments today.</p>
              )}
            </Card>

            <Card title="Recent activity" description="Latest changes from the PKS feed.">
              {activity && activity.length > 0 ? (
                <ul className="flex flex-col gap-2.5">
                  {activity.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 text-sm">
                      {e.source === "d2l" ? (
                        <GraduationCap className="size-3.5 shrink-0 text-indigo-400" />
                      ) : e.source === "gmail" ? (
                        <Mail className="size-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <Calendar className="size-3.5 shrink-0 text-amber-400" />
                      )}
                      <span className="flex-1 truncate text-zinc-300">{e.type}</span>
                      <span className="shrink-0 text-[11px] text-zinc-500">
                        {relativeTime(e.timestamp.getTime())}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-zinc-500">
                  <History className="size-3.5" /> No activity yet — sync will populate this.
                </p>
              )}
            </Card>

            <Card title="Busy this week" description="Days over capacity.">
              <div className="flex items-center gap-3">
                <BarChart3 className="size-4 text-zinc-500" />
                <span className="text-2xl font-semibold tabular-nums text-zinc-100">
                  {sched?.busyDays ?? 0}
                </span>
                <span className="text-xs text-zinc-500">
                  {sched?.busiestDay != null
                    ? `busiest: ${DAY_LABELS[new Date(sched.busiestDay).getDay()]}`
                    : "of 7 days"}
                </span>
              </div>
            </Card>

            <Link to="/kanban">
              <Button variant="secondary" className="w-full">
                <ListTodo className="size-3.5" />
                Open Kanban
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
