import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "../components/page-placeholder";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <PagePlaceholder
      title="Dashboard"
      description="What to work on next, what's at risk, and how busy this week will be."
      note="Built in PR #5 (planning layer) — see docs/plan.md"
    />
  );
}
