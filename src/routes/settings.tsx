import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Plug, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  getBaseUrl,
  getDataMode,
  getEffortSettings,
  listCapacity,
  removeEffortCourseOverride,
  setBaseUrl,
  setCapacityHours,
  setDataMode,
  setEffortCourseOverride,
  setEffortDefault,
  type DataMode,
} from "../db/repo/settings.repo";
import {
  checkHealth,
  clearApiKey,
  hasApiKey,
  storeApiKey,
} from "../lib/pks/client";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

function ConnectionSection() {
  const queryClient = useQueryClient();
  const { data: baseUrl } = useQuery({
    queryKey: ["settings", "pksBaseUrl"],
    queryFn: getBaseUrl,
  });
  const { data: mode } = useQuery({
    queryKey: ["settings", "dataMode"],
    queryFn: getDataMode,
  });
  const { data: keyPresent } = useQuery({
    queryKey: ["settings", "hasApiKey"],
    queryFn: hasApiKey,
  });

  const [urlDraft, setUrlDraft] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [health, setHealth] = useState<{ ok: boolean; detail?: string; version?: string } | null>(null);

  const saveUrl = useMutation({
    mutationFn: async (url: string) => {
      await setBaseUrl(url);
      queryClient.setQueryData(["settings", "pksBaseUrl"], url.replace(/\/+$/, ""));
    },
  });

  const saveKey = useMutation({
    mutationFn: async (key: string) => {
      await storeApiKey(key);
      queryClient.setQueryData(["settings", "hasApiKey"], true);
    },
  });

  const removeKey = useMutation({
    mutationFn: async () => {
      await clearApiKey();
      queryClient.setQueryData(["settings", "hasApiKey"], false);
    },
  });

  const testConnection = useMutation({
    mutationFn: async () => {
      const result = await checkHealth();
      setHealth(result);
      return result;
    },
  });

  const saveMode = useMutation({
    mutationFn: async (next: DataMode) => {
      await setDataMode(next);
      queryClient.setQueryData(["settings", "dataMode"], next);
    },
  });

  return (
    <Card
      title="Connection"
      description="The PKS API this app pulls from. The API key is stored in your OS keychain and never enters the app window."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-400">Base URL</label>
          <div className="flex gap-2">
            <Input
              value={urlDraft || baseUrl || ""}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="http://localhost:8001/api/v1"
              spellCheck={false}
            />
            <Button
              variant="secondary"
              disabled={!urlDraft || urlDraft === baseUrl}
              onClick={() => saveUrl.mutate(urlDraft)}
            >
              Save
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
            <KeyRound className="size-3" />
            API key {keyPresent && <CheckCircle2 className="size-3 text-emerald-500" />}
          </label>
          {keyPresent ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-400">
                stored in macOS Keychain
              </span>
              <Button variant="ghost" size="sm" onClick={() => removeKey.mutate()}>
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="pks_..."
                spellCheck={false}
              />
              <Button
                variant="secondary"
                disabled={!keyDraft}
                onClick={() => saveKey.mutate(keyDraft)}
              >
                Store
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => testConnection.mutate()}
            disabled={testConnection.isPending}
          >
            <RefreshCw className={`size-3.5 ${testConnection.isPending ? "animate-spin" : ""}`} />
            Test connection
          </Button>
          {health && (
            <span
              className={`text-xs ${
                health.ok ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {health.ok
                ? `Connected — API v${health.version ?? "?"}`
                : `Unreachable — ${health.detail}`}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-4">
          <label className="text-xs font-medium text-zinc-400">Data mode</label>
          <div className="flex items-center gap-2">
            {(["fixture", "live"] as const).map((m) => (
              <Button
                key={m}
                variant={mode === m ? "primary" : "secondary"}
                size="sm"
                onClick={() => saveMode.mutate(m)}
              >
                {m === "fixture" ? "Demo data" : "Live API"}
              </Button>
            ))}
            <p className="text-xs text-zinc-600">
              {mode === "fixture"
                ? "Using built-in demo data — no backend needed."
                : "Pulling from the PKS API. Requires a key."}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

const WEEKDAY_ROWS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

function CapacitySection() {
  const queryClient = useQueryClient();
  const { data: capacity } = useQuery({
    queryKey: ["capacity", "profile"],
    queryFn: listCapacity,
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async ({ id, hours }: { id: string; hours: number }) => {
      await setCapacityHours(id, hours);
      queryClient.invalidateQueries({ queryKey: ["capacity", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["capacity"] });
    },
  });

  return (
    <Card
      title="Capacity"
      description="Your available hours per weekday. Commitments and scheduled tasks are packed against these."
    >
      <div className="flex flex-col gap-2">
        {WEEKDAY_ROWS.map((row) => {
          const value = capacity ? (capacity[row.key] ?? 0) : 0;
          const draft = drafts[row.key] ?? String(value);
          return (
            <div key={row.key} className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">{row.label}</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={16}
                  step={0.5}
                  value={draft}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [row.key]: e.target.value }))
                  }
                  onBlur={() => {
                    const hours = Number.parseFloat(draft);
                    const next = Number.isFinite(hours) && hours >= 0 ? hours : 0;
                    if (next !== value) {
                      void save.mutateAsync({ id: row.key, hours: next });
                    }
                    setDrafts((d) => ({ ...d, [row.key]: String(next) }));
                  }}
                  className="w-20 text-right"
                  aria-label={`${row.label} hours`}
                />
                <span className="w-8 text-xs text-zinc-500">h</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const SOURCE_ROWS = ["assignment", "email", "manual"] as const;

function EffortSection() {
  const queryClient = useQueryClient();
  const { data: effortSettings } = useQuery({
    queryKey: ["settings", "effortDefaults"],
    queryFn: getEffortSettings,
  });
  const [sourceDrafts, setSourceDrafts] = useState<Record<string, string>>({});
  const [newCourse, setNewCourse] = useState("");
  const [newMinutes, setNewMinutes] = useState("");

  const setDefault = useMutation({
    mutationFn: async ({ source, minutes }: { source: string; minutes: number }) => {
      const next = await setEffortDefault(source, minutes);
      queryClient.setQueryData(["settings", "effortDefaults"], next);
      queryClient.invalidateQueries({ queryKey: ["capacity"] });
      return next;
    },
  });

  const setOverride = useMutation({
    mutationFn: async ({ course, minutes }: { course: string; minutes: number }) => {
      const next = await setEffortCourseOverride(course, minutes);
      queryClient.setQueryData(["settings", "effortDefaults"], next);
      queryClient.invalidateQueries({ queryKey: ["capacity"] });
      return next;
    },
  });

  const removeOverride = useMutation({
    mutationFn: async (course: string) => {
      const next = await removeEffortCourseOverride(course);
      queryClient.setQueryData(["settings", "effortDefaults"], next);
      queryClient.invalidateQueries({ queryKey: ["capacity"] });
      return next;
    },
  });

  const overrides = effortSettings?.effortCourseOverrides ?? {};

  return (
    <Card
      title="Effort defaults"
      description="Fallback estimates used before a task has an explicit effort. Course overrides beat source defaults."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {SOURCE_ROWS.map((source) => {
            const current = effortSettings?.effortDefaults[source] ?? 180;
            const draft = sourceDrafts[source] ?? String(current);
            return (
              <div key={source} className="flex items-center justify-between">
                <span className="text-sm capitalize text-zinc-300">{source}</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    step={15}
                    value={draft}
                    onChange={(e) =>
                      setSourceDrafts((d) => ({ ...d, [source]: e.target.value }))
                    }
                    onBlur={() => {
                      const minutes = Number.parseInt(draft, 10);
                      const next = Number.isFinite(minutes) && minutes >= 0 ? minutes : current;
                      if (next !== current) void setDefault.mutate({ source, minutes: next });
                      setSourceDrafts((d) => ({ ...d, [source]: String(next) }));
                    }}
                    className="w-20 text-right"
                    aria-label={`${source} default minutes`}
                  />
                  <span className="w-8 text-xs text-zinc-500">min</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
          <span className="text-xs font-medium text-zinc-400">Course overrides</span>
          {Object.entries(overrides).map(([course, minutes]) => (
            <div key={course} className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">{course}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">{minutes} min</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void removeOverride.mutate(course)}
                  className="text-zinc-500 hover:text-rose-400"
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-2">
            <Input
              value={newCourse}
              onChange={(e) => setNewCourse(e.target.value)}
              placeholder="Course name"
              className="flex-1"
            />
            <Input
              type="number"
              min={0}
              step={15}
              value={newMinutes}
              onChange={(e) => setNewMinutes(e.target.value)}
              placeholder="Minutes"
              className="w-24"
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={!newCourse.trim() || !newMinutes.trim()}
              onClick={() => {
                const minutes = Number.parseInt(newMinutes, 10);
                if (!Number.isFinite(minutes) || minutes < 0) return;
                void setOverride.mutate({ course: newCourse.trim(), minutes });
                setNewCourse("");
                setNewMinutes("");
              }}
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Settings() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <header className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-50">
          <Plug className="size-6 text-zinc-400" />
          Settings
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Connection, capacity, and effort defaults.
        </p>
      </header>
      <div className="flex flex-col gap-6">
        <ConnectionSection />
        <CapacitySection />
        <EffortSection />
      </div>
    </div>
  );
}
