import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "../components/page-placeholder";

export const Route = createFileRoute("/kanban")({
  component: Kanban,
});

function Kanban() {
  return (
    <PagePlaceholder
      title="Kanban"
      description="Drag tasks through Backlog, Next, In Progress, Blocked, and Done."
      note="Built in PR #6 — see docs/plan.md"
    />
  );
}
