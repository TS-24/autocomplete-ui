# Product Specification

> [!IMPORTANT]
> **EXTERNAL REFERENCE — PKS DATA PRODUCT**
> This document describes the **PKS data product** (backend in `Autocomplete/`), **not** the `autocomplete-ui` project. It exists here as background so UI agents understand what the API is for. Do not modify; source of truth is `Autocomplete/docs/`.

## Executive Summary

**Personal Knowledge Stream (PKS)** is a personal data platform that continuously ingests information from external systems (email, calendar, LMS, etc.) and exposes a normalized event API for downstream AI applications, mobile apps, and dashboards.

The platform separates **deterministic data collection** from **intelligent reasoning**. Connectors fetch and normalize data; AI agents consume clean internal events without ever touching Gmail, D2L, or other external APIs directly.

PKS becomes the **single source of truth** for a user's digital life events — assignments due, emails received, calendar changes, grades posted — enabling queries like "What changed today?" or "Summarize unread email" without coupling AI to external service quirks.

**Phase 1** delivers the core platform plus three connectors: D2L/Brightspace, Gmail, and Google Calendar.

---

## Scope

### In Scope (Phase 1)

- Core ingestion pipeline: collectors → normalizers → database → event bus → public API
- Connector framework with pluggable, independently deployable connectors
- Common event model with source, type, timestamp, payload, and metadata
- Snapshot-based change detection producing domain events
- PostgreSQL persistence with full history
- FastAPI REST API for querying events, snapshots, and connector status
- **Per-source data endpoints** — each data source exposes 2-3 dedicated REST endpoints (list, detail, sync) alongside the normalized event/snapshot APIs
- **Playwright browser automation for all Phase 1 connectors** — Gmail, Google Calendar, and D2L all collect data via headless browser sessions instead of provider-specific APIs
- **Fully containerized deployment** — the entire stack (API, scheduler, Playwright runtime, PostgreSQL) runs in Docker containers orchestrated by Docker Compose; no host-level Python or browser installation required
- Credential storage for browser-login credentials (Gmail, Calendar, D2L) encrypted at rest
- Alembic database migrations
- Structured logging and health checks

### Out of Scope (Phase 1)

- AI/LLM reasoning layer
- Mobile or web dashboard UI
- Push notifications (Discord, SMS, email alerts)
- Multi-user / team tenancy
- Redis, Celery, Temporal, NATS/Kafka (planned for future)
- Google OAuth2 / Gmail API / Calendar API (Phase 1 uses Playwright for all sources; official APIs deferred to a future optimization)
- Phase 2 connectors (GitHub, Outlook, Notion, Slack, Discord)

---

## Non-Goals

| Non-Goal | Rationale |
|----------|-----------|
| AI reasoning inside connectors | Connectors are deterministic workflows only |
| Direct external API exposure to AI | AI consumes internal events, never raw provider APIs |
| Real-time streaming (<1s latency) | Polling-based ingestion is acceptable for v1 |
| Multi-tenant SaaS | Single-user personal platform initially |
| Data modification in external systems | Read-only ingestion; no write-back to Gmail/D2L |
| Connector marketplace / plugin store | Manual connector registration for v1 |
| End-user billing or subscriptions | Personal project scope |

---

## Functional Requirements

### FR-1: Connector Management

- FR-1.1: System shall support registering connectors with type, config, and credentials reference
- FR-1.2: System shall allow enabling/disabling connectors per user
- FR-1.3: System shall track connector health (last sync, status, error count)
- FR-1.4: Each connector shall be independently deployable as a module

### FR-2: Data Ingestion

- FR-2.1: Connectors shall fetch raw data from external systems on a configurable schedule
- FR-2.2: Raw payloads shall be stored before normalization for audit/debug
- FR-2.3: Normalizers shall convert raw data into internal domain models
- FR-2.4: Ingestion failures shall be logged with retry metadata

### FR-3: Change Detection

- FR-3.1: System shall maintain snapshots of current entity state per connector
- FR-3.2: Change detector shall compare new snapshots against previous and emit events
- FR-3.3: Events shall include: source, type, timestamp, payload, metadata
- FR-3.4: Supported event types (Phase 1): `AssignmentCreated`, `AssignmentUpdated`, `GradePosted`, `EmailReceived`, `EmailUpdated`, `CalendarEventCreated`, `CalendarEventUpdated`, `CalendarEventDeleted`

### FR-4: Event Storage & History

- FR-4.1: All events shall be persisted with immutable history
- FR-4.2: Events shall be queryable by type, source, time range, and connector
- FR-4.3: Snapshots shall be versioned for rollback/debug

### FR-5: Public API

- FR-5.1: REST API shall expose events, snapshots, connectors, and health
- FR-5.2: API shall support pagination, filtering, and sorting
- FR-5.3: All request/response bodies shall use Pydantic-validated schemas
- FR-5.4: API shall return OpenAPI documentation at `/docs`

### FR-6: Authentication & Secrets

- FR-6.1: API access protected by API key (Phase 1)
- FR-6.2: All external-system login credentials (Gmail, Calendar, D2L usernames/passwords) stored encrypted at rest via Fernet
- FR-6.3: Browser session cookies/tokens persisted encrypted between sync cycles so Playwright sessions can be reused

### FR-7: Phase 1 Connectors (Playwright)

- FR-7.1: **D2L Connector** — assignments, grades, announcements collected via Playwright browser automation
- FR-7.2: **Gmail Connector** — inbox messages collected via Playwright browser automation (headless login to Gmail web, scrape message list + detail)
- FR-7.3: **Google Calendar Connector** — events collected via Playwright browser automation (headless login to Calendar web, scrape upcoming events)
- FR-7.4: All connectors shall use the same Playwright-based collection pattern (login → navigate → scrape → store raw → normalize), ensuring uniform connector implementation
- FR-7.5: Connectors shall persist browser session state (cookies, storage) between runs to avoid re-login on every sync
- FR-7.6: Connectors shall re-login automatically on session expiry

### FR-8: Per-Source Data Endpoints

- FR-8.1: Each Phase 1 data source shall expose 2-3 dedicated REST endpoints under `/api/v1/{source}/`
- FR-8.2: Gmail endpoints: `GET /api/v1/gmail/messages` (list), `GET /api/v1/gmail/messages/{id}` (detail), `POST /api/v1/gmail/sync` (trigger sync)
- FR-8.3: Calendar endpoints: `GET /api/v1/calendar/events` (list), `GET /api/v1/calendar/events/{id}` (detail), `POST /api/v1/calendar/sync` (trigger sync)
- FR-8.4: D2L endpoints: `GET /api/v1/d2l/assignments` (list), `GET /api/v1/d2l/grades` (list), `POST /api/v1/d2l/sync` (trigger sync)
- FR-8.5: Per-source list endpoints shall read from normalized snapshots/events (not live-scrape on every request); the `POST .../sync` endpoint triggers a Playwright collection cycle
- FR-8.6: All per-source endpoints require API key authentication

### FR-9: Containerization

- FR-9.1: The entire application stack shall run in Docker containers via Docker Compose
- FR-9.2: The API container shall include the FastAPI server, sync scheduler, and Playwright runtime (Chromium) in a single image
- FR-9.3: PostgreSQL shall run as a separate container with a persistent volume
- FR-9.4: A reverse proxy container (Caddy) shall terminate TLS in production
- FR-9.5: No host-level installation of Python, Node, or browsers shall be required to run the stack
- FR-9.6: Development and production shall use the same container images with environment-based configuration

---

## Non-Functional Requirements

### NFR-1: Performance

- NFR-1.1: API p95 latency < 200ms for event list queries (up to 100 items)
- NFR-1.2: Connector sync cycle configurable (default: 15 minutes)
- NFR-1.3: Database queries shall use appropriate indexes

### NFR-2: Reliability

- NFR-2.1: Connector failures shall not crash the platform
- NFR-2.2: Failed syncs shall retry with exponential backoff (max 3 attempts)
- NFR-2.3: Health endpoint shall report database and connector status

### NFR-3: Maintainability

- NFR-3.1: Clean Architecture with dependency injection
- NFR-3.2: Strong typing throughout (Pydantic, type hints)
- NFR-3.3: No global mutable state
- NFR-3.4: Test coverage target: 80% for core domain logic

### NFR-4: Observability

- NFR-4.1: Structured JSON logging with correlation IDs
- NFR-4.2: Request/response logging for API (excluding secrets)
- NFR-4.3: Connector sync metrics (duration, items processed, errors)

### NFR-5: Security

- NFR-5.1: Secrets never logged or committed to version control
- NFR-5.2: OAuth tokens encrypted at rest
- NFR-5.3: API keys hashed in database
- NFR-5.4: HTTPS required in production

### NFR-6: Developer Experience

- NFR-6.1: `docker compose up` starts full local stack with zero host dependencies
- NFR-6.2: Alembic migrations run automatically on startup (dev)
- NFR-6.3: OpenAPI spec auto-generated from code

### NFR-7: Containerization & Deployment

- NFR-7.1: Production Docker image shall use a multi-stage build with a non-root user
- NFR-7.2: Playwright/Chromium shall be installed in a dedicated image layer for caching
- NFR-7.3: Production image size target: <1 GB (including Chromium)
- NFR-7.4: All configuration shall be supplied via environment variables — no baked-in secrets
- NFR-7.5: Containers shall emit structured JSON logs to stdout for log aggregation
- NFR-7.6: Container health check shall hit `/health` so orchestrators can detect liveness

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     External Systems                             │
│   D2L/Brightspace    Gmail (Web)    Google Calendar (Web)       │
└──────────┬─────────────────┬─────────────────┬──────────────────┘
           │                 │                 │
           ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              Collectors (all via Playwright)                     │
│   D2LConnector      GmailConnector    CalendarConnector         │
│   (Playwright)      (Playwright)      (Playwright)              │
│   headless Chromium sessions, persisted login state             │
└──────────┬─────────────────┬─────────────────┬──────────────────┘
           │                 │                 │
           ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Normalizers                                │
│   Raw → Internal Models (Assignment, Email, CalendarEvent)      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Change Detector                               │
│   Snapshot diff → Domain Events                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PostgreSQL                                   │
│   events | snapshots | raw_payloads | connectors | users        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Public API (FastAPI)                        │
│  /events  /snapshots  /connectors  /health                       │
│  + per-source: /gmail/*  /calendar/*  /d2l/*                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              AI Applications / Mobile / Dashboards               │
│                      (Future consumers)                          │
└─────────────────────────────────────────────────────────────────┘

   All components run in Docker containers (Docker Compose):
   ┌──────────┐   ┌──────────────┐   ┌──────────┐
   │  Caddy   │──►│   pks-api    │──►│ Postgres │
   │ (TLS)    │   │ + scheduler  │   │  +volume │
   └──────────┘   │ + Playwright │   └──────────┘
                  │ + Chromium   │
                  └──────────────┘
```

### Key Design Decisions

1. **Playwright for all connectors** — Gmail and Calendar are collected via headless browser automation (same as D2L) instead of official OAuth APIs. This unifies the connector pattern, avoids OAuth flow complexity, and works against services without API access. Tradeoff: more brittle to UI changes and slower than native APIs; acceptable for a personal-scale polling platform. Official APIs may be added later as an optimized transport behind the same connector interface.
2. **Per-source endpoints** — Each data source exposes 2-3 dedicated REST endpoints (list, detail, sync) so consumers can query a single source directly without filtering the global event stream. These read from normalized snapshots; sync endpoints trigger a Playwright collection cycle.
3. **Fully containerized** — The entire stack (API, scheduler, Playwright/Chromium, PostgreSQL, reverse proxy) runs in Docker Compose with zero host dependencies. Dev and prod share the same images.
4. **Polling over webhooks** — Simpler for personal use; all sources are polled on a schedule since Playwright cannot receive push notifications.
5. **In-process event bus** — Sufficient for single-user; external bus deferred to Phase 2.
6. **Snapshot diffing** — Reliable change detection without provider-specific delta APIs.
7. **Raw payload retention** — Enables re-normalization if scrapers or schemas evolve.
