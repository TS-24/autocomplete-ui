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
