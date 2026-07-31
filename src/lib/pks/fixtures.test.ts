import { describe, expect, it } from "vitest";
import { buildFixtures } from "./fixtures";

const NOW = new Date(2026, 6, 15, 12, 0, 0).getTime(); // Wed Jul 15 2026

describe("fixtures", () => {
  it("is deterministic for a given now", () => {
    const a = buildFixtures(NOW);
    const b = buildFixtures(NOW);
    expect(a).toEqual(b);
  });

  it("contains all three connectors", () => {
    const { connectors } = buildFixtures(NOW);
    expect(connectors.map((c) => c.type)).toEqual([
      "gmail",
      "google_calendar",
      "d2l",
    ]);
    expect(connectors[2].lastSyncStatus).toBe("failed");
  });

  it("covers all four entity types with plausible counts", () => {
    const { snapshots } = buildFixtures(NOW);
    const byType = new Map<string, number>();
    for (const s of snapshots) {
      byType.set(s.entityType, (byType.get(s.entityType) ?? 0) + 1);
    }
    expect(byType.get("assignment")!).toBeGreaterThanOrEqual(8);
    expect(byType.get("grade")!).toBeGreaterThanOrEqual(6);
    expect(byType.get("email")!).toBeGreaterThanOrEqual(15);
    expect(byType.get("calendar_event")!).toBeGreaterThanOrEqual(11);
  });

  it("is date-relative: dates shift with now", () => {
    const later = NOW + 7 * 86_400_000;
    const dueNow = buildFixtures(NOW).snapshots.find(
      (s) => s.externalId === "asg-2",
    )!;
    const dueLater = buildFixtures(later).snapshots.find(
      (s) => s.externalId === "asg-2",
    )!;
    expect(dueLater.updatedAt - dueNow.updatedAt).toBe(7 * 86_400_000);
  });

  it("snapshots are unique on (connectorId, entityType, externalId)", () => {
    const { snapshots } = buildFixtures(NOW);
    const keys = new Set(
      snapshots.map((s) => `${s.connectorId}:${s.entityType}:${s.externalId}`),
    );
    expect(keys.size).toBe(snapshots.length);
  });
});
