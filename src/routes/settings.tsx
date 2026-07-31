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
  setBaseUrl,
  setDataMode,
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
        <Card title="Coming soon">
          <p className="text-xs text-zinc-500">
            Capacity profile (hours per weekday) and effort defaults arrive with
            the planning layer (PR #5).
          </p>
        </Card>
      </div>
    </div>
  );
}
