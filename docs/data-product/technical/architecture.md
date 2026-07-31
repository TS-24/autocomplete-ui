# Architecture

> [!IMPORTANT]
> **EXTERNAL REFERENCE — PKS DATA PRODUCT**
> This document describes the **PKS data product** design (backend in `Autocomplete/`), **not** the `autocomplete-ui` project. It exists here for context on how the API the UI consumes works. Do not modify; source of truth is `Autocomplete/docs/`.

## Overview

PKS follows **Clean Architecture** with four layers:

```
┌─────────────────────────────────────────────┐
│              Presentation Layer              │
│         FastAPI routes, middleware          │
├─────────────────────────────────────────────┤
│              Application Layer               │
│    Use cases, services, event handlers      │
├─────────────────────────────────────────────┤
│                Domain Layer                  │
│   Entities, events, connector interfaces    │
├─────────────────────────────────────────────┤
│             Infrastructure Layer             │
│  SQLAlchemy repos, external APIs, Playwright│
└─────────────────────────────────────────────┘
```

Dependencies flow inward: outer layers depend on inner layers, never the reverse.

---

## Components

### 1. API Server (FastAPI)

- REST endpoints for events, snapshots, connectors, auth
- **Per-source endpoints**: `/api/v1/gmail/*`, `/api/v1/calendar/*`, `/api/v1/d2l/*` (2-3 endpoints each: list, detail, sync)
- Middleware: API key auth, request ID, CORS, rate limiting
- Dependency injection via FastAPI `Depends()`
- Auto-generated OpenAPI documentation

### 2. Connector Framework

```
BaseConnector (ABC)
├── collect() -> list[RawPayload]
├── normalize(raw) -> list[DomainEntity]
└── health_check() -> ConnectorHealth

ConnectorRegistry
├── register(type, class)
├── get(type) -> BaseConnector
└── list_types() -> list[str]

SyncScheduler
├── schedule(connector, cron)
├── trigger_sync(connector_id)
└── on_sync_complete(callback)
```

### 3. Normalization Pipeline

```
Raw Payload → Normalizer → Domain Entity → Snapshot Store → Change Detector → Event
```

Each stage is independent and testable.

### 4. Change Detection

```
Previous Snapshot + New Entity Data
         ↓
    Field-level diff
         ↓
  Event(s) generated
         ↓
    Event Bus publish
```

Diff strategy:
- **New external_id:** CREATE event
- **Changed fields:** UPDATE event (payload contains changed fields only)
- **Missing from fetch (with tombstone support):** DELETE event

### 5. Event Bus (In-Process v1)

```python
class EventBus:
    async def publish(event: DomainEvent) -> None
    def subscribe(event_type: str, handler: Callable) -> None
```

Handlers:
- `EventPersistenceHandler` — writes to PostgreSQL
- `LoggingHandler` — structured log of all events
- Future: `NotificationHandler`, `WebhookHandler`

### 6. Data Stores

| Store | Purpose | Technology |
|-------|---------|------------|
| Primary DB | Events, snapshots, connectors, users | PostgreSQL 16 |
| Raw payloads | Audit/debug of external data | PostgreSQL JSONB |
| Credentials | Encrypted login credentials (all sources) | PostgreSQL + Fernet |
| Browser state | Playwright cookies/localStorage per source | PostgreSQL (encrypted) or file |

---

## Data Flow: Connector Sync

```
1. Scheduler triggers sync for connector X
2. Connector.collect() fetches raw data from external system
3. Raw payloads stored in raw_payloads table
4. For each raw payload:
   a. Normalizer.normalize() → DomainEntity
   b. SnapshotStore.upsert(entity)
   c. ChangeDetector.diff(previous, current) → Events
   d. EventBus.publish(each event)
5. EventPersistenceHandler writes events to DB
6. SyncRun marked complete with stats
```

---

## Data Flow: API Query

```
1. Client sends GET /api/v1/events?type=EmailReceived&since=...
2. API key middleware validates X-API-Key
3. EventService.query(filters, pagination)
4. EventRepository.find(filters) → SQL query
5. Pydantic response model serialization
6. JSON response with pagination metadata
```

---

## Connector Architecture

All Phase 1 connectors collect data via **Playwright browser automation**. Gmail,
Google Calendar, and D2L each use headless Chromium sessions with persisted login
state. This unifies the connector pattern and removes OAuth/API integration
complexity.

Each connector is a Python module implementing `BaseConnector`:

```
src/pks/connectors/
├── base.py              # BaseConnector ABC
├── registry.py          # ConnectorRegistry
├── browser/
│   ├── session.py       # Shared Playwright session manager (login, cookie persistence, re-login)
│   └── storage.py       # Encrypted browser-state storage (cookies, localStorage)
├── gmail/
│   ├── connector.py     # GmailConnector
│   ├── scraper.py       # Playwright scraper for Gmail web (message list + detail)
│   └── normalizer.py    # GmailNormalizer → Email entities
├── calendar/
│   ├── connector.py     # CalendarConnector
│   ├── scraper.py       # Playwright scraper for Google Calendar web
│   └── normalizer.py    # CalendarNormalizer → CalendarEvent entities
└── d2l/
    ├── connector.py
    ├── browser.py       # D2L-specific Playwright login/session
    ├── scrapers/
    │   ├── assignments.py
    │   └── grades.py
    └── normalizer.py
```

Connectors are registered at startup:

```python
registry.register("gmail", GmailConnector)
registry.register("google_calendar", CalendarConnector)
registry.register("d2l", D2LConnector)
```

### Playwright Collection Pattern (shared by all connectors)

```
1. Load encrypted browser state (cookies/localStorage) from credentials store
2. Launch headless Chromium with persisted state
3. Navigate to source URL
4. If session expired → re-login using stored credentials
5. Scrape target pages (page-object selectors)
6. Store raw HTML/JSON payloads to raw_payloads table
7. Persist updated browser state (encrypted) for next run
8. Close browser context
```

All connectors share a `BrowserSession` helper that handles launch, state
load/save, and re-login, so connector-specific code only implements the scraping
selectors and normalization.

---

## Security Architecture

```
┌──────────────┐     HTTPS      ┌──────────────┐
│   Client     │ ──────────────►│  API Server  │
│  (AI Agent)  │  X-API-Key     │              │
└──────────────┘                └──────┬───────┘
                                       │
                              ┌────────▼────────┐
                              │  Auth Middleware │
                              │  (hash compare)  │
                              └────────┬────────┘
                                       │
                              ┌────────▼────────┐
                              │   PostgreSQL     │
                              │  (encrypted creds)│
                              └─────────────────┘
```

- API keys: SHA-256 hashed, never stored plaintext
- Browser-login credentials (Gmail, Calendar, D2L): Fernet encrypted with `ENCRYPTION_KEY`
- Browser session state (cookies, localStorage): encrypted before persistence
- All secrets via environment variables

---

## Deployment Architecture (Phase 1) — Fully Containerized

```
┌─────────────────────────────────────────────────────┐
│                   Docker Host                        │
│                                                      │
│  ┌─────────────┐    ┌────────────────────┐          │
│  │   caddy     │    │      pks-api        │          │
│  │ (TLS term.) │───►│  (FastAPI)          │          │
│  └─────────────┘    │  + sync scheduler   │          │
│                     │  + Playwright       │          │
│                     │  + Chromium (headl.)│          │
│                     └─────────┬──────────┘          │
│                               │                      │
│                     ┌─────────▼──────────┐          │
│                     │     postgres        │          │
│                     │   (PostgreSQL 16)   │          │
│                     │   volume: data      │          │
│                     └────────────────────┘          │
└─────────────────────────────────────────────────────┘
         Docker Compose orchestrates all containers.
         Zero host-level Python / Node / browser deps.
```

The entire stack runs in Docker containers via Docker Compose. The API container
bundles the FastAPI server, the sync scheduler, and the Playwright/Chromium
runtime so connector collection happens in-process. PostgreSQL runs as a
separate container with a persistent volume. Caddy terminates TLS in production.
Dev and prod share the same container images, differing only by environment
variables.

---

## Future Architecture (Phase 2+)

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Gmail    │  │ D2L      │  │ GitHub   │  ← Connector sidecars
│ sidecar  │  │ sidecar  │  │ sidecar  │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │
     └──────────┬──┘─────────────┘
                ▼
         ┌─────────────┐
         │  NATS/Kafka  │  ← External event bus
         └──────┬──────┘
                ▼
         ┌─────────────┐
         │  API Server  │
         └──────┬──────┘
                ▼
         ┌─────────────┐
         │  PostgreSQL  │
         └─────────────┘
```
