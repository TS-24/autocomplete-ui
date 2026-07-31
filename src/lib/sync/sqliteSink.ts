import * as connectorRepo from "../../db/repo/connectors.repo";
import * as mirrorRepo from "../../db/repo/mirror.repo";
import * as activityRepo from "../../db/repo/activity.repo";
import * as syncStateRepo from "../../db/repo/syncstate.repo";
import * as taskRepo from "../../db/repo/tasks.repo";
import type {
  ActivityEvent,
  EntityType,
  SyncSink,
} from "./sources";

/**
 * SyncSink over SQLite (docs/sync-engine.md §1). All mirror writes go through
 * `sql_batch` — atomic per page, never partial.
 */
export const sqliteSink: SyncSink = {
  async upsertConnectors(cs, now) {
    await connectorRepo.upsertConnectors(cs, now);
  },
  async tombstoneConnectors(liveIds, now) {
    await connectorRepo.tombstoneConnectors(liveIds, now);
  },
  async listConnectors() {
    return (await connectorRepo.listConnectors()).map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      status: c.status,
      lastSyncAt: c.lastSyncAt?.getTime() ?? null,
      lastSyncStatus: c.lastSyncStatus,
      errorCount: c.errorCount,
      updatedAt: c.updatedAt.getTime(),
    }));
  },
  async upsertSnapshots(items, now) {
    await mirrorRepo.upsertSnapshots(items, now);
  },
  async listMirror(includeDeleted = false) {
    const rows = await mirrorRepo.listMirror({ includeDeleted });
    return rows.map((r) => ({
      connectorId: r.connectorId,
      entityType: r.entityType as EntityType,
      externalId: r.externalId,
      payload: r.payload as Record<string, unknown>,
      version: r.version,
      updatedAt: r.updatedAt.getTime(),
      deletedAt: r.deletedAt?.getTime() ?? null,
    }));
  },
  async tombstoneMirror(connectorId, entityType, seen, now) {
    await mirrorRepo.tombstoneMirror(connectorId, entityType, seen, now);
  },
  async upsertActivity(events, now) {
    await activityRepo.upsertActivity(events, now);
  },
  async listEvents(limit = 20) {
    const rows = await activityRepo.listRecentEvents(limit);
    return rows.map((r): ActivityEvent => ({
      id: r.id,
      source: r.source,
      type: r.type,
      timestamp: r.timestamp.getTime(),
      payload: (r.payload as Record<string, unknown> | null) ?? null,
    }));
  },
  async listTasks(includeArchived = false) {
    return taskRepo.listTasks({ includeArchived });
  },
  async getWatermark(connectorId, entityType) {
    return syncStateRepo.getWatermark(connectorId, entityType);
  },
  async setWatermark(connectorId, entityType, watermark, now) {
    await syncStateRepo.setWatermark(connectorId, entityType, watermark, now);
  },
  async markFullReconcile(connectorId, entityType, now) {
    await syncStateRepo.markFullReconcile(connectorId, entityType, now);
  },
};
