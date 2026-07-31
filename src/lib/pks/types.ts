import { z } from "zod";

/**
 * Zod schemas for the PKS API, matching the live backend
 * (http://localhost:8001/api/v1) as verified in docs/api-contract.md.
 * Payloads are `.passthrough()` — unknown fields must never break the UI.
 */

export const isoDate = z.coerce.date();

// ---------------------------------------------------------------------------
// Pagination envelope
// ---------------------------------------------------------------------------

export const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  });

// ---------------------------------------------------------------------------
// /connectors
// ---------------------------------------------------------------------------

export const connectorSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  status: z.enum(["active", "disabled", "error"]).catch("error"),
  last_sync_at: isoDate.nullable(),
  last_sync_status: z.string().nullable(),
  error_count: z.number(),
  config: z.record(z.string(), z.unknown()),
  created_at: isoDate,
  updated_at: isoDate,
});

export const connectorsResponseSchema = paginated(connectorSchema);

export type ConnectorResponse = z.infer<typeof connectorSchema>;

export const healthSchema = z.object({
  status: z.string(),
  version: z.string().optional(),
  database: z.string().optional(),
  uptime_seconds: z.number().optional(),
});

// ---------------------------------------------------------------------------
// /snapshots
// ---------------------------------------------------------------------------

export const snapshotSchema = z.object({
  id: z.string(),
  connector_id: z.string(),
  entity_type: z.enum(["email", "calendar_event", "assignment", "grade"]),
  external_id: z.string(),
  data: z.record(z.string(), z.unknown()),
  version: z.number(),
  updated_at: isoDate,
});

export const snapshotsResponseSchema = paginated(snapshotSchema);

export type SnapshotResponse = z.infer<typeof snapshotSchema>;

// ---------------------------------------------------------------------------
// /events
// ---------------------------------------------------------------------------

export const eventSchema = z.object({
  id: z.string(),
  source: z.string(),
  type: z.string(),
  timestamp: isoDate,
  payload: z.record(z.string(), z.unknown()).nullable(),
  metadata: z
    .object({
      connector_id: z.string().nullable().optional(),
      external_id: z.string().nullable().optional(),
      entity_type: z.string().nullable().optional(),
      sync_run_id: z.string().nullable().optional(),
    })
    .passthrough(),
  created_at: isoDate,
});

export const eventsResponseSchema = paginated(eventSchema);

export type EventResponse = z.infer<typeof eventSchema>;

// ---------------------------------------------------------------------------
// Sync trigger (POST /{source}/sync, POST /connectors/{id}/sync)
// ---------------------------------------------------------------------------

export const syncTriggerSchema = z.object({
  sync_run_id: z.string(),
  status: z.string(),
  message: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Connector health
// ---------------------------------------------------------------------------

export const connectorHealthSchema = z.object({
  connector_id: z.string(),
  status: z.string(),
  is_healthy: z.boolean(),
  last_sync_at: isoDate.nullable(),
  last_sync_status: z.string().nullable(),
  last_error: z.string().nullable(),
  error_count: z.number(),
  recent_syncs: z.array(z.record(z.string(), z.unknown())),
});

// ---------------------------------------------------------------------------
// Normalized entity payloads (snapshot `data` / per-source endpoints)
// ---------------------------------------------------------------------------

export const assignmentPayloadSchema = z
  .object({
    external_id: z.string().optional(),
    course_name: z.string().optional().default(""),
    course_id: z.string().optional(),
    title: z.string().default("Untitled assignment"),
    due_date: isoDate.nullable().optional(),
    status: z.string().optional().default("not submitted"),
    url: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .passthrough();

export type AssignmentPayload = z.infer<typeof assignmentPayloadSchema>;

export const gradePayloadSchema = z
  .object({
    external_id: z.string().optional(),
    course_name: z.string().optional().default(""),
    assignment_name: z.string().optional().default(""),
    score: z.number().nullable().optional(),
    max_score: z.number().nullable().optional(),
    percentage: z.number().nullable().optional(),
    feedback: z.string().nullable().optional(),
    graded_at: isoDate.nullable().optional(),
  })
  .passthrough();

export type GradePayload = z.infer<typeof gradePayloadSchema>;

export const emailPayloadSchema = z
  .object({
    external_id: z.string().optional(),
    thread_id: z.string().optional(),
    subject: z.string().default("(no subject)"),
    sender: z.string().default(""),
    recipients: z.array(z.string()).default([]),
    body_text: z.string().nullable().optional(),
    body_html: z.string().nullable().optional(),
    labels: z.array(z.string()).default([]),
    is_read: z.boolean().default(false),
    is_starred: z.boolean().default(false),
    received_at: isoDate,
  })
  .passthrough();

export type EmailPayload = z.infer<typeof emailPayloadSchema>;

export const calendarEventPayloadSchema = z
  .object({
    external_id: z.string().optional(),
    calendar_id: z.string().optional(),
    title: z.string().default("(untitled event)"),
    description: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    start: isoDate,
    end: isoDate,
    is_all_day: z.boolean().default(false),
    attendees: z.array(z.string()).default([]),
    status: z.string().default("confirmed"),
    recurrence: z.string().nullable().optional(),
  })
  .passthrough();

export type CalendarEventPayload = z.infer<typeof calendarEventPayloadSchema>;

export const errorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type PksErrorBody = z.infer<typeof errorBodySchema>;
