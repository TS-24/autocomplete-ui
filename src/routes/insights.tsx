import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "../components/page-placeholder";

export const Route = createFileRoute("/insights")({
  component: Insights,
});

function Insights() {
  return (
    <PagePlaceholder
      title="Insights"
      description="Task distribution, due histograms, throughput, and grade trends."
      note="Built in PR #7 — see docs/plan.md"
    />
  );
}
