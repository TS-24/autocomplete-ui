import { checkHealth as liveHealth, pksFetch } from "./client";
import {
  connectorsResponseSchema,
  eventsResponseSchema,
  snapshotsResponseSchema,
  syncTriggerSchema,
} from "./types";
import type {
  ActivityEvent,
  ConnectorInfo,
  EntityType,
  SnapshotInfo,
  SyncSource,
} from "../sync/sources";

/**
 * Live PKS source (docs/api-contract.md §2). Every response is Zod-parsed at
 * the boundary; every date becomes epoch ms.
 */

const toMs = (d: Date): number => d.getTime();

export class ReconcileSyncSource implements SyncSource {
  async listConnectors(): Promise<ConnectorInfo[]> {
    const res = await pksFetch(connectorsResponseSchema, { path: "/connectors" });
    return res.items.map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      status: c.status,
      lastSyncAt: c.last_sync_at ? toMs(c.last_sync_at) : null,
      lastSyncStatus: c.last_sync_status,
      errorCount: c.error_count,
      updatedAt: toMs(c.updated_at),
    }));
  }

  async listSnapshots(opts: {
    connectorId: string;
    entityType: EntityType;
    limit: number;
    offset: number;
  }): Promise<{ items: SnapshotInfo[]; total: number }> {
    const res = await pksFetch(snapshotsResponseSchema, {
      path: "/snapshots",
      query: {
        connector_id: opts.connectorId,
        entity_type: opts.entityType,
        limit: opts.limit,
        offset: opts.offset,
      },
    });
    return {
      items: res.items.map((s) => ({
        connectorId: s.connector_id,
        entityType: s.entity_type,
        externalId: s.external_id,
        payload: s.data,
        version: s.version,
        updatedAt: toMs(s.updated_at),
      })),
      total: res.total,
    };
  }

  async listRecentEvents(opts: {
    since: number;
    limit: number;
  }): Promise<ActivityEvent[]> {
    const res = await pksFetch(eventsResponseSchema, {
      path: "/events",
      query: { since: new Date(opts.since).toISOString(), limit: opts.limit },
    });
    return res.items.map((e) => ({
      id: e.id,
      source: e.source,
      type: e.type,
      timestamp: toMs(e.timestamp),
      payload: e.payload,
    }));
  }

  async triggerSync(connectorId: string): Promise<void> {
    const connector = await pksFetch(connectorsResponseSchema, {
      path: "/connectors",
    });
    const c = connector.items.find((x) => x.id === connectorId);
    const type = c?.type ?? connectorId;
    const segment = type === "google_calendar" ? "calendar" : type;
    await pksFetch(syncTriggerSchema, {
      path: `/${segment}/sync`,
      method: "POST",
    });
  }

  async checkHealth(): Promise<{ ok: boolean; version?: string; detail?: string }> {
    return liveHealth();
  }
}
