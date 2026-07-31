import type {
  ActivityEvent,
  ConnectorInfo,
  SnapshotInfo,
  SyncSource,
} from "../sync/sources";
import { ENTITY_TYPES_FOR } from "../sync/sources";
import type { EntityType } from "../../db/schema";
import { startOfDay } from "../time";

/**
 * Deterministic, date-relative mock of the PKS API (docs/api-contract.md §6).
 * The same `now` always yields the same data, so tests can assert on it.
 * Serves as the default `dataMode` until the backend can ingest real data
 * (docs/backend-blockers.md).
 */

interface FixtureSeed {
  connectors: ConnectorInfo[];
  snapshots: SnapshotInfo[];
  events: ActivityEvent[];
}

const HOUR = 3_600_000;

function connector(
  id: string,
  type: string,
  name: string,
  lastSyncAt: number | null,
  lastSyncStatus: string | null,
  errorCount = 0,
): ConnectorInfo {
  return {
    id,
    type,
    name,
    status: "active",
    lastSyncAt,
    lastSyncStatus,
    errorCount,
    updatedAt: lastSyncAt,
  };
}

export function buildFixtures(now: number): FixtureSeed {
  const today = startOfDay(now);

  const connectors: ConnectorInfo[] = [
    connector("conn-gmail", "gmail", "My Gmail", now - 2 * 60 * 1000, "success"),
    connector("conn-cal", "google_calendar", "My Calendar", now - 30 * 60 * 1000, "success"),
    connector("conn-d2l", "d2l", "Brightspace (D2L)", now - 26 * HOUR, "failed", 1),
  ];

  const snapshots: SnapshotInfo[] = [];

  const assignment = (
    i: number,
    course: string,
    title: string,
    dueInDays: number | null,
    status: string,
    version = 1,
    minutesAgo = 10,
  ): SnapshotInfo => ({
    connectorId: "conn-d2l",
    entityType: "assignment",
    externalId: `asg-${i}`,
    payload: {
      external_id: `asg-${i}`,
      course_name: course,
      course_id: course.toLowerCase().replace(" ", "-"),
      title,
      due_date: dueInDays === null ? null : new Date(today + dueInDays * 86_400_000 + 23 * HOUR + 59 * 60_000).toISOString(),
      status,
      url: null,
      description: null,
    },
    version,
    updatedAt: now - minutesAgo * 60_000,
  });

  snapshots.push(
    // Overdue (2 days) — never submitted
    assignment(1, "CS 101", "Problem Set 2", -2, "overdue", 3, 10),
    // Due today
    assignment(2, "CS 101", "Problem Set 3", 0, "not submitted", 2, 15),
    // Due this week
    assignment(3, "MATH 230", "Homework 5", 1, "not_started", 1, 20),
    assignment(4, "ENGL 115", "Essay draft", 2, "not submitted", 1, 30),
    assignment(5, "CS 101", "Lab 4 writeup", 3, "not submitted", 1, 40),
    // Next week
    assignment(6, "MATH 230", "Homework 6", 5, "not_started", 1, 50),
    assignment(7, "PHYS 120", "Problem set 4", 7, "not_started", 1, 60),
    assignment(8, "ENGL 115", "Peer review", 8, "not_started", 1, 70),
    // Completed
    assignment(9, "CS 101", "Problem Set 1", -6, "submitted", 2, 200),
  );

  const grade = (i: number, course: string, name: string, score: number, max: number, gradedInDays: number): SnapshotInfo => ({
    connectorId: "conn-d2l",
    entityType: "grade",
    externalId: `grd-${i}`,
    payload: {
      external_id: `grd-${i}`,
      course_name: course,
      assignment_name: name,
      score,
      max_score: max,
      percentage: Math.round((score / max) * 1000) / 10,
      feedback: i % 2 === 0 ? "Good work on Q3." : null,
      graded_at: new Date(today - gradedInDays * 86_400_000 + 15 * HOUR).toISOString(),
    },
    version: 1,
    updatedAt: now - (gradedInDays * 24 + 2) * HOUR,
  });

  snapshots.push(
    grade(1, "CS 101", "Problem Set 1", 45, 50, 6),
    grade(2, "MATH 230", "Homework 4", 28, 30, 9),
    grade(3, "CS 101", "Quiz 2", 18, 20, 12),
    grade(4, "ENGL 115", "Reading response", 9.5, 10, 15),
    grade(5, "PHYS 120", "Lab 2", 40, 40, 18),
    grade(6, "MATH 230", "Homework 3", 22, 30, 22),
  );

  const email = (i: number, subject: string, sender: string, opts: {
    read?: boolean;
    starred?: boolean;
    hoursAgo?: number;
  } = {}): SnapshotInfo => {
    const { read = false, starred = false, hoursAgo = 3 } = opts;
    return {
      connectorId: "conn-gmail",
      entityType: "email",
      externalId: `msg-${i}`,
      payload: {
        external_id: `msg-${i}`,
        thread_id: `thr-${i % 4}`,
        subject,
        sender,
        recipients: ["me@example.com"],
        body_text: `Body of "${subject}".\n\n${sender} is asking about something that needs a reply soon.`,
        body_html: null,
        labels: ["INBOX", ...(starred ? ["STARRED"] : [])],
        is_read: read,
        is_starred: starred,
        received_at: new Date(now - hoursAgo * HOUR - i * 7 * 60_000).toISOString(),
      },
      version: 1,
      updatedAt: now - hoursAgo * HOUR - i * 7 * 60_000,
    };
  };

  snapshots.push(
    email(1, "Meeting tomorrow", "alice@example.com", { hoursAgo: 1, starred: true }),
    email(2, "PS3 clarifications", "prof.cs101@university.edu", { hoursAgo: 2 }),
    email(3, "Homework 5 grading complete", "grading@math.university.edu", { hoursAgo: 4 }),
    email(4, "Lab session rescheduled", "ta.physics@university.edu", { hoursAgo: 5 }),
    email(5, "Study group Thursday?", "sam@example.com", { hoursAgo: 8 }),
    email(6, "Campus events this week", "events@university.edu", { hoursAgo: 12, read: true }),
    email(7, "Office hours changed", "prof.cs101@university.edu", { hoursAgo: 18 }),
    email(8, "Your submission was received", "d2l@university.edu", { hoursAgo: 24, read: true }),
    email(9, "Library holds notice", "library@university.edu", { hoursAgo: 30, read: true }),
    email(10, "Group project check-in", "jordan@example.com", { hoursAgo: 40 }),
    email(11, "Scholarship deadline", "finaid@university.edu", { hoursAgo: 50, starred: true }),
    email(12, "Weekly digest", "news@university.edu", { hoursAgo: 70, read: true }),
    email(13, "Lab 3 feedback", "ta.physics@university.edu", { hoursAgo: 80, read: true }),
    email(14, "Room change: Tuesday lecture", "registrar@university.edu", { hoursAgo: 90 }),
    email(15, "Old newsletter", "spammy@example.com", { hoursAgo: 200, read: true }),
  );

  const calEvent = (
    i: number,
    title: string,
    startInDays: number,
    startHour: number,
    durationHours: number,
    opts: { allDay?: boolean; cancelled?: boolean; minutesAgo?: number } = {},
  ): SnapshotInfo => {
    const start = new Date(today + startInDays * 86_400_000 + startHour * HOUR);
    const end = new Date(start.getTime() + durationHours * HOUR);
    return {
      connectorId: "conn-cal",
      entityType: "calendar_event",
      externalId: `evt-${i}`,
      payload: {
        external_id: `evt-${i}`,
        calendar_id: "primary",
        title,
        description: null,
        location: opts.allDay ? null : "Campus",
        start: start.toISOString(),
        end: end.toISOString(),
        is_all_day: !!opts.allDay,
        attendees: ["me@example.com"],
        status: opts.cancelled ? "cancelled" : "confirmed",
        recurrence: null,
      },
      version: 1,
      updatedAt: now - (opts.minutesAgo ?? 120) * 60_000,
    };
  };

  snapshots.push(
    calEvent(1, "CS 101 lecture", 0, 9, 1.5, { minutesAgo: 90 }),
    calEvent(2, "Group project sync", 0, 14, 1, { minutesAgo: 100 }),
    calEvent(3, "MATH 230 tutorial", 1, 10, 1, { minutesAgo: 110 }),
    calEvent(4, "Gym", 1, 17, 1),
    calEvent(5, "CS 101 lab", 2, 13, 2),
    calEvent(6, "ENGL 115 seminar", 3, 11, 1.5),
    calEvent(7, "Career fair", 4, 9, 4, { allDay: false }),
    calEvent(8, "PHYS 120 lecture", 4, 15, 1),
    calEvent(9, "Coffee with advisor", 5, 10, 0.5, { cancelled: true }),
    calEvent(10, "Hackathon kickoff", 6, 18, 2, { allDay: true }),
    calEvent(11, "CS 101 lecture", 7, 9, 1.5),
  );

  const eventTypes: Record<string, string[]> = {
    gmail: ["email.received", "email.updated"],
    google_calendar: ["calendar_event.created", "calendar_event.updated"],
    d2l: ["assignment.created", "assignment.updated", "grade.posted"],
  };

  const events: ActivityEvent[] = snapshots
    .filter((s) => s.updatedAt > now - 48 * HOUR)
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 25)
    .map((s, i) => {
      const pool = eventTypes[s.connectorId] ?? ["updated"];
      const type = pool[i % pool.length];
      return {
        id: `evt-${s.entityType}-${s.externalId}-${s.updatedAt}`,
        source: s.connectorId === "conn-cal" ? "google_calendar" : s.connectorId === "conn-gmail" ? "gmail" : "d2l",
        type,
        timestamp: s.updatedAt,
        payload: { ...s.payload, external_id: s.externalId },
      };
    });

  return { connectors, snapshots, events };
}

const LATENCY_MS = 50;

export class FixtureSyncSource implements SyncSource {
  constructor(
    private readonly now: () => number = Date.now,
    private readonly delay: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  private seed(): FixtureSeed {
    return buildFixtures(this.now());
  }

  private async simulate(): Promise<void> {
    await this.delay(LATENCY_MS);
  }

  async listConnectors(): Promise<ConnectorInfo[]> {
    await this.simulate();
    return this.seed().connectors;
  }

  async listSnapshots(opts: {
    connectorId: string;
    entityType: EntityType;
    limit: number;
    offset: number;
  }): Promise<{ items: SnapshotInfo[]; total: number }> {
    await this.simulate();
    const all = this.seed().snapshots
      .filter(
        (s) =>
          s.connectorId === opts.connectorId && s.entityType === opts.entityType,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      items: all.slice(opts.offset, opts.offset + opts.limit),
      total: all.length,
    };
  }

  async listRecentEvents(opts: {
    since: number;
    limit: number;
  }): Promise<ActivityEvent[]> {
    await this.simulate();
    return this.seed()
      .events.filter((e) => e.timestamp >= opts.since)
      .slice(0, opts.limit);
  }

  async triggerSync(connectorId: string): Promise<void> {
    await this.simulate();
    void connectorId;
  }

  async checkHealth(): Promise<{ ok: boolean; version?: string }> {
    await this.simulate();
    return { ok: true, version: "fixture" };
  }
}

export const FIXTURE_CONNECTOR_TYPES = Object.keys(ENTITY_TYPES_FOR);
