import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "../components/page-placeholder";

export const Route = createFileRoute("/week")({
  component: Week,
});

function Week() {
  return (
    <PagePlaceholder
      title="Week"
      description="Commitments and scheduled task blocks on one timeline."
      note="Built in PR #7 — see docs/plan.md"
    />
  );
}
