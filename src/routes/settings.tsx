import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "../components/page-placeholder";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

function Settings() {
  return (
    <PagePlaceholder
      title="Settings"
      description="Connection, API key, capacity profile, and effort defaults."
      note="Built in PR #3 (data layer) and PR #5 (planning) — see docs/plan.md"
    />
  );
}
