import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Columns3,
  Inbox,
  Plus,
  Sparkles,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import {
  archiveTask,
  createManualTask,
  listTasks,
  promoteEmailToTask,
  updateTask,
} from "../db/repo/tasks.repo";
import { listUnreadEmails } from "../db/repo/mirror.repo";
import { getEffortSettings } from "../db/repo/settings.repo";
import type { MirrorEntity, Task, TaskStatus } from "../db/schema";
import { emailPayloadSchema } from "../lib/pks/types";
import { effectiveEffort, type EffortSettings } from "../lib/schedule/effort";
import {
  formatEffort,
  groupTasksByStatus,
  isOverdue,
  KANBAN_COLUMNS,
  statusFromDropTarget,
} from "../lib/kanban";
import { formatRelative } from "../lib/time";

export const Route = createFileRoute("/kanban")({
  component: Kanban,
});

const ORIGIN_BADGE: Record<string, { label: string; tone: "accent" | "ok" | "default" }> = {
  assignment: { label: "D2L", tone: "accent" },
  email: { label: "Gmail", tone: "ok" },
  manual: { label: "manual", tone: "default" },
};

function useEffortSettings(): EffortSettings {
  const { data } = useQuery({
    queryKey: ["settings", "effortDefaults"],
    queryFn: getEffortSettings,
  });
  return data ?? { effortDefaults: {}, effortCourseOverrides: {} };
}

function PriorityDots({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" title={value === -1 ? "auto" : `priority ${value}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`size-1.5 rounded-full ${
            value >= 0 && i < value ? "bg-indigo-400" : "bg-zinc-700"
          }`}
        />
      ))}
    </span>
  );
}

interface CardActionsProps {
  task: Task;
  onArchive: (id: string) => void;
  effortSettings: EffortSettings;
}

function CardActions({ task, onArchive, effortSettings }: CardActionsProps) {
  const queryClient = useQueryClient();
  const [editingEffort, setEditingEffort] = useState(false);
  const [effortDraft, setEffortDraft] = useState("");

  const mutate = useMutation({
    mutationFn: async (patch: {
      status?: TaskStatus;
      priority?: number;
      effortMinutes?: number | null;
      completedAt?: Date | null;
    }) => {
      await updateTask(task.id, patch, ["status", "priority", "effortMinutes", "dueAt"]);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["capacity"] });
    },
  });

  const markDone = () => {
    if (task.status === "done") return;
    void mutate.mutateAsync({ status: "done", completedAt: new Date() });
  };

  const stepPriority = (delta: number) => {
    const next = Math.min(4, Math.max(0, (task.priority === -1 ? 0 : task.priority) + delta));
    void mutate.mutateAsync({ priority: next });
  };

  const saveEffort = () => {
    const hours = Number.parseFloat(effortDraft);
    const minutes = Number.isFinite(hours) && hours >= 0 ? Math.round(hours * 60) : null;
    void mutate.mutateAsync({ effortMinutes: minutes });
    setEditingEffort(false);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => stepPriority(-1)}
          className="text-zinc-600 transition-colors hover:text-zinc-300"
          aria-label="lower priority"
        >
          <ArrowDown className="size-3" />
        </button>
        <PriorityDots value={task.priority} />
        <button
          onClick={() => stepPriority(1)}
          className="text-zinc-600 transition-colors hover:text-zinc-300"
          aria-label="raise priority"
        >
          <ArrowUp className="size-3" />
        </button>
      </div>

      {editingEffort ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            value={effortDraft}
            onChange={(e) => setEffortDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEffort();
              if (e.key === "Escape") setEditingEffort(false);
            }}
            className="w-14 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-100 focus:border-indigo-500 focus:outline-none"
          />
          <button onClick={saveEffort} className="text-[11px] text-indigo-400 hover:text-indigo-300">
            ok
          </button>
        </span>
      ) : (
        <button
          onClick={() => {
            setEffortDraft(formatEffort(effectiveEffort(task, effortSettings)));
            setEditingEffort(true);
          }}
          className="rounded border border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
          title="edit effort"
        >
          {formatEffort(effectiveEffort(task, effortSettings))}
        </button>
      )}

      {task.status !== "done" && (
        <button
          onClick={markDone}
          className="text-zinc-600 transition-colors hover:text-emerald-400"
          title="mark done"
        >
          <CheckCircle2 className="size-3.5" />
        </button>
      )}
      <button
        onClick={() => onArchive(task.id)}
        className="text-zinc-600 transition-colors hover:text-zinc-300"
        title="archive"
      >
        <Archive className="size-3.5" />
      </button>
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  onArchive: (id: string) => void;
  effortSettings: EffortSettings;
}

function TaskCard({ task, onArchive, effortSettings }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });
  const origin = ORIGIN_BADGE[task.originKind ?? "manual"] ?? ORIGIN_BADGE.manual;
  const overdue = isOverdue(task);
  const effort = effectiveEffort(task, effortSettings);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`group cursor-grab rounded-lg border bg-zinc-900/80 p-3 shadow-sm transition-colors active:cursor-grabbing ${
        isDragging ? "border-indigo-500 opacity-60" : "border-zinc-800 hover:border-zinc-700"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium leading-snug text-zinc-100">{task.title}</h4>
        <Badge tone={origin.tone}>{origin.label}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {task.course && (
          <Badge tone="default" className="bg-zinc-800/80">{task.course}</Badge>
        )}
        {task.dueAt && (
          <Badge tone={overdue ? "danger" : "warn"}>
            {formatRelative(task.dueAt.getTime())}
          </Badge>
        )}
        <span className="text-[11px] text-zinc-500">{formatEffort(effort)}</span>
      </div>
      <div className="mt-2 opacity-0 transition-opacity group-hover:opacity-100">
        <CardActions task={task} onArchive={onArchive} effortSettings={effortSettings} />
      </div>
    </div>
  );
}

interface ColumnProps {
  id: TaskStatus;
  label: string;
  tasks: Task[];
  onNewTask: (status: TaskStatus) => void;
  onArchive: (id: string) => void;
  effortSettings: EffortSettings;
}

function Column({ id, label, tasks, onNewTask, onArchive, effortSettings }: ColumnProps) {
  const { setNodeRef, isOver } = useSortable({ id: `column-${id}` });
  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-[60vh] w-60 shrink-0 flex-col rounded-xl border bg-zinc-950/60 ${
        isOver ? "border-indigo-500" : "border-zinc-800"
      }`}
    >
      <header className="flex items-center justify-between px-3 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {label} <span className="ml-1 text-zinc-600">{tasks.length}</span>
        </h3>
        <button
          onClick={() => onNewTask(id)}
          className="text-zinc-500 transition-colors hover:text-zinc-200"
          title={`new task in ${label}`}
        >
          <Plus className="size-3.5" />
        </button>
      </header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 pt-0">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onArchive={onArchive} effortSettings={effortSettings} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-800 p-3 text-center text-[11px] text-zinc-600">
            drop a card here
          </div>
        )}
      </div>
    </section>
  );
}

function NewTaskDialog({
  open,
  status,
  onClose,
}: {
  open: boolean;
  status: TaskStatus | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [due, setDue] = useState("");
  const [hours, setHours] = useState("");
  const [priority, setPriority] = useState("-1");

  const create = useMutation({
    mutationFn: async () => {
      await createManualTask({
        title,
        course: course || null,
        dueAt: due ? new Date(`${due}T12:00:00`).getTime() : null,
        effortMinutes: hours ? Math.round(Number.parseFloat(hours) * 60) : null,
        priority: Number.parseInt(priority, 10),
        status: status ?? "backlog",
      });
    },
    onSuccess: () => {
      setTitle("");
      setCourse("");
      setDue("");
      setHours("");
      setPriority("-1");
      onClose();
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["capacity"] });
    },
  });

  return (
    <Dialog open={open} onClose={onClose} title={`New task in ${status ?? "backlog"}`}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) void create.mutate();
        }}
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
          Title
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
            Course
            <Input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="CS 101" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
            Due date
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
            Effort (hours)
            <Input
              type="number"
              min={0}
              step={0.25}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="2"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
            Priority
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="-1">auto</option>
              {[0, 1, 2, 3, 4].map((p) => (
                <option key={p} value={String(p)}>
                  {p}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!title.trim() || create.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function InboxStrip({ effortSettings }: { effortSettings: EffortSettings }) {
  const queryClient = useQueryClient();
  const { data: emails } = useQuery({
    queryKey: ["mirror", "email", "unread"],
    queryFn: () => listUnreadEmails(10),
  });
  const { data: tasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => listTasks(),
  });

  const promotedIds = useMemo(
    () =>
      new Set(
        (tasks ?? [])
          .filter((t) => t.originKind === "email" && t.originExternalId)
          .map((t) => t.originExternalId as string),
      ),
    [tasks],
  );

  const promote = useMutation({
    mutationFn: async (email: MirrorEntity) => {
      const p = emailPayloadSchema.parse(email.payload);
      await promoteEmailToTask({
        externalId: p.external_id ?? email.externalId,
        connectorId: email.connectorId,
        subject: p.subject,
        sender: p.sender,
        body: p.body_text,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["capacity"] });
    },
  });

  const unread = (emails ?? []).filter((e) => !promotedIds.has(e.externalId));

  if (unread.length === 0) return null;

  return (
    <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/60">
      <header className="flex items-center gap-2 border-b border-zinc-800 px-5 py-3">
        <Inbox className="size-4 text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-200">
          Inbox <span className="text-zinc-500">({unread.length} unread)</span>
        </h2>
      </header>
      <ul className="divide-y divide-zinc-800/70">
        {unread.map((e) => {
          const p = emailPayloadSchema.safeParse(e.payload);
          if (!p.success) return null;
          return (
            <li key={e.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-200">{p.data.subject}</p>
                <p className="truncate text-xs text-zinc-500">
                  {p.data.sender} · {formatRelative(e.updatedAt.getTime())}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={promote.isPending}
                onClick={() => void promote.mutate(e)}
              >
                <Sparkles className="size-3" />
                → Task
              </Button>
            </li>
          );
        })}
      </ul>
      <footer className="px-5 py-2 text-[11px] text-zinc-600">
        Promoted emails become tasks in Backlog (
        {effortSettings.effortDefaults.email ?? 15}m estimated).
      </footer>
    </div>
  );
}

function Kanban() {
  const queryClient = useQueryClient();
  const effortSettings = useEffortSettings();
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus | null>(null);

  const { data: tasks = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => listTasks(),
  });

  const moveTask = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      await updateTask(id, { status }, ["status"]);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["capacity"] });
    },
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      await archiveTask(id, Date.now());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["capacity"] });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const status = statusFromDropTarget(over.id as string, byId);
    const task = byId.get(active.id as string);
    if (!status || !task || task.status === status) return;
    const previous: Task[] = [...tasks];
    // optimistic
    const next: Task[] = tasks.map((t) =>
      t.id === task.id ? { ...t, status } : t,
    );
    queryClient.setQueryData<Task[]>(["tasks"], next);
    void moveTask.mutateAsync({ id: task.id, status }).catch(() => {
      queryClient.setQueryData<Task[]>(["tasks"], previous);
    });
  };

  const groups = groupTasksByStatus(tasks);

  return (
    <div className="flex h-full flex-col px-8 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-50">
            <Columns3 className="size-6 text-zinc-400" />
            Kanban
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Drag cards between columns — moves are pinned so re-syncs keep them.
          </p>
        </div>
      </header>

      <InboxStrip effortSettings={effortSettings} />

      {isLoading && (
        <div className="flex flex-1 gap-4">
          {KANBAN_COLUMNS.map((c) => (
            <div key={c.id} className="h-full w-60 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />
          ))}
        </div>
      )}
      {isError && (
        <div className="rounded-xl border border-rose-800 bg-rose-500/10 p-4 text-sm text-rose-300">
          Failed to load tasks.{" "}
          <button onClick={() => void refetch()} className="underline">Retry</button>
        </div>
      )}
      {!isLoading && !isError && (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
          <div className="flex flex-1 gap-4 overflow-x-auto">
            {KANBAN_COLUMNS.map((col) => (
              <Column
                key={col.id}
                id={col.id}
                label={col.label}
                tasks={groups[col.id]}
                onNewTask={setNewTaskStatus}
                onArchive={(id) => void archive.mutate(id)}
                effortSettings={effortSettings}
              />
            ))}
          </div>
        </DndContext>
      )}

      <NewTaskDialog
        open={newTaskStatus !== null}
        status={newTaskStatus}
        onClose={() => setNewTaskStatus(null)}
      />
    </div>
  );
}
