export type { EntityType } from "../../db/schema";
import type { Task } from "../../db/schema";
import type { EntityType } from "../../db/schema";

/**
 * Shared sync-domain types and the SyncSource interface
 * (docs/sync-engine.md §1). `ReconcileSyncSource` (live) lands with the
 * engine; `FixtureSyncSource` is the default until then.
 */

export interface ConnectorInfo {
  id: string;
  type: string;
  name: string;
  status: string;
  lastSyncAt: number | null;
  lastSyncStatus: string | null;
  errorCount: number;
  updatedAt: number | null;
}

export interface SnapshotInfo {
  connectorId: string;
  entityType: EntityType;
  externalId: string;
  payload: Record<string, unknown>;
  version: number;
  updatedAt: number;
}

export interface ActivityEvent {
  id: string;
  source: string;
  type: string;
  timestamp: number;
  payload: Record<string, unknown> | null;
}

export interface SyncSource {
  listConnectors(): Promise<ConnectorInfo[]>;
  listSnapshots(opts: {
    connectorId: string;
    entityType: EntityType;
    limit: number;
    offset: number;
  }): Promise<{ items: SnapshotInfo[]; total: number }>;
  listRecentEvents(opts: {
    since: number;
    limit: number;
  }): Promise<ActivityEvent[]>;
  triggerSync(connectorId: string): Promise<void>;
  checkHealth(): Promise<{ ok: boolean; version?: string; detail?: string }>;
}

export const ENTITY_TYPES_FOR: Record<string, EntityType[]> = {
  gmail: ["email"],
  google_calendar: ["calendar_event"],
  d2l: ["assignment", "grade"],
};

/** A mirror row as persisted: `SnapshotInfo` + tombstone flag. */
export interface MirrorRow extends SnapshotInfo {
  deletedAt: number | null;
}

/** Repo-side mirror, implemented by `SqliteSink` (live) and `MemorySink` (tests). */
export interface SyncSink {
  upsertConnectors(cs: ConnectorInfo[], now: number): Promise<void>;
  tombstoneConnectors(liveIds: string[], now: number): Promise<void>;
  listConnectors(): Promise<ConnectorInfo[]>;
  upsertSnapshots(items: SnapshotInfo[], now: number): Promise<void>;
  listMirror(includeDeleted?: boolean): Promise<MirrorRow[]>;
  tombstoneMirror(
    connectorId: string,
    entityType: EntityType,
    seen: Set<string>,
    now: number,
  ): Promise<void>;
  upsertActivity(events: ActivityEvent[], now: number): Promise<void>;
  listEvents(limit?: number): Promise<ActivityEvent[]>;
  listTasks(includeArchived?: boolean): Promise<Task[]>;
  getWatermark(connectorId: string, entityType: EntityType): Promise<number>;
  setWatermark(
    connectorId: string,
    entityType: EntityType,
    watermark: number,
    now: number,
  ): Promise<void>;
  markFullReconcile(connectorId: string, entityType: EntityType, now: number): Promise<void>;
}
