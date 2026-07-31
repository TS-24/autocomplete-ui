import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "../components/page-placeholder";

export const Route = createFileRoute("/sources")({
  component: Sources,
});

function Sources() {
  return (
    <PagePlaceholder
      title="Sources"
      description="Connector health, last sync, and manual sync triggers."
      note="Built in PR #4 (sync engine) — see docs/plan.md"
    />
  );
}
