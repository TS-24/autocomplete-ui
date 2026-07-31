import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export type EntityType = "email" | "calendar_event" | "assignment" | "grade";
export type ConnectorType = "gmail" | "google_calendar" | "d2l";
export type TaskStatus =
  | "backlog"
  | "next"
  | "in_progress"
  | "blocked"
  | "done";
export type OriginKind = "assignment" | "email" | "manual";

// ---------------------------------------------------------------------------
// Mirror (written ONLY by the sync engine — never user-edited)
// ---------------------------------------------------------------------------

export const connectors = sqliteTable(
  "connectors",
  {
    id: text("id").primaryKey(), // upstream connector UUID
    type: text("type").notNull(), // gmail | google_calendar | d2l
    name: text("name").notNull(),
    status: text("status").notNull(), // active | disabled | error
    lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
    lastSyncStatus: text("last_sync_status"),
    errorCount: integer("error_count").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }), // tombstone
    syncedAt: integer("synced_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("idx_connectors_status").on(t.status)],
);

export const mirrorEntities = sqliteTable(
  "mirror_entities",
  {
    id: text("id").primaryKey(), // UI-generated UUID
    connectorId: text("connector_id").notNull(),
    entityType: text("entity_type").notNull(), // email | calendar_event | assignment | grade
    externalId: text("external_id").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    version: integer("version").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }), // tombstone
  },
  (t) => [
    uniqueIndex("mirror_entities_uniq").on(
      t.connectorId,
      t.entityType,
      t.externalId,
    ),
    index("idx_mirror_entity_type").on(t.entityType),
    index("idx_mirror_updated").on(t.updatedAt),
  ],
);

export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: text("id").primaryKey(), // upstream event UUID (stable)
    source: text("source").notNull(),
    type: text("type").notNull(),
    timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
    payload: text("payload", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("idx_activity_created").on(t.createdAt)],
);

// ---------------------------------------------------------------------------
// Local (written ONLY by the user and local logic — never by the mirror)
// ---------------------------------------------------------------------------

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(), // UI-generated UUID
    title: text("title").notNull(),
    description: text("description"),
    originKind: text("origin_kind", { enum: ["assignment", "email", "manual"] }),
    originExternalId: text("origin_external_id"),
    originConnectorId: text("origin_connector_id"),
    originEntityType: text("origin_entity_type"),
    status: text("status", {
      enum: ["backlog", "next", "in_progress", "blocked", "done"],
    })
      .notNull()
      .default("backlog"),
    priority: integer("priority").notNull().default(-1), // -1 auto, 0..4 user
    effortMinutes: integer("effort_minutes"),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    course: text("course"),
    source: text("source"), // d2l | gmail | manual
    overrides: text("overrides", { mode: "json" }).notNull().default(sql`'{}'`),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("idx_tasks_status").on(t.status),
    index("idx_tasks_due").on(t.dueAt),
    index("idx_tasks_origin").on(t.originEntityType, t.originExternalId),
  ],
);

export const syncState = sqliteTable("sync_state", {
  id: text("id").primaryKey(), // `${connectorId}:${entityType}`
  connectorId: text("connector_id").notNull(),
  entityType: text("entity_type").notNull(),
  watermark: integer("watermark", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`0`),
  lastFullReconcileAt: integer("last_full_reconcile_at", {
    mode: "timestamp_ms",
  }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export const capacityProfile = sqliteTable("capacity_profile", {
  id: text("id").primaryKey(), // mon|tue|wed|thu|fri|sat|sun
  hours: real("hours").notNull(),
});

export type Connector = typeof connectors.$inferSelect;
export type MirrorEntity = typeof mirrorEntities.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type SyncState = typeof syncState.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
export type CapacityRow = typeof capacityProfile.$inferSelect;

export type NewTask = typeof tasks.$inferInsert;
