# Sequence Diagrams

> [!IMPORTANT]
> **EXTERNAL REFERENCE — PKS DATA PRODUCT**
> These diagrams describe **PKS data product** flows (backend in `Autocomplete/`), **not** the `autocomplete-ui` project. Reference only; do not modify. Source of truth: `Autocomplete/docs/`.

## 1. Connector Sync Flow

```mermaid
sequenceDiagram
    participant Scheduler
    participant SyncService
    participant Connector
    participant External as External System
    participant Normalizer
    participant SnapshotStore
    participant ChangeDetector
    participant EventBus
    participant EventRepo as Event Repository
    participant DB as PostgreSQL

    Scheduler->>SyncService: trigger_sync(connector_id)
    SyncService->>DB: create SyncRun (running)
    SyncService->>Connector: collect()

    loop For each page/batch
        Connector->>External: fetch data
        External-->>Connector: raw data
        Connector->>DB: store RawPayload
    end

    Connector-->>SyncService: CollectResult

    loop For each RawPayload
        SyncService->>Normalizer: normalize(raw)
        Normalizer-->>SyncService: DomainEntity

        SyncService->>SnapshotStore: get_previous(external_id)
        SnapshotStore->>DB: SELECT snapshot
        DB-->>SnapshotStore: previous snapshot

        SyncService->>SnapshotStore: upsert(entity)
        SnapshotStore->>DB: UPSERT snapshot

        SyncService->>ChangeDetector: detect(previous, current)
        ChangeDetector-->>SyncService: list of Events

        loop For each Event
            SyncService->>EventBus: publish(event)
            EventBus->>EventRepo: persist(event)
            EventRepo->>DB: INSERT event
        end
    end

    SyncService->>DB: update SyncRun (success)
    SyncService->>DB: update Connector (last_sync_at)
```

---

## 2. API Event Query Flow

```mermaid
sequenceDiagram
    participant Client as AI Agent
    participant Middleware as Auth Middleware
    participant API as Events Endpoint
    participant Service as EventService
    participant Repo as EventRepository
    participant DB as PostgreSQL

    Client->>API: GET /api/v1/events?type=email.received&since=...
    API->>Middleware: validate request
    Middleware->>Middleware: hash API key, lookup
    Middleware-->>API: authenticated user

    API->>Service: query(filters, pagination)
    Service->>Repo: find(user_id, filters, limit, offset)
    Repo->>DB: SELECT ... WHERE user_id = ? AND type = ? ...
    DB-->>Repo: rows
    Repo-->>Service: list of Events
    Service-->>API: PaginatedResponse

    API-->>Client: 200 JSON response
```

---

## 3. Google OAuth Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant API as PKS API
    participant Google as Google OAuth
    participant CredStore as Credential Store
    participant DB as PostgreSQL

    User->>Browser: Click "Connect Gmail"
    Browser->>API: GET /auth/google/authorize?connector_id=...
    API->>API: generate state token
    API-->>Browser: 302 Redirect to Google

    Browser->>Google: Authorization request
    Google->>User: Consent screen
    User->>Google: Grant permission
    Google-->>Browser: 302 Redirect to callback?code=...&state=...

    Browser->>API: GET /auth/google/callback?code=...&state=...
    API->>API: validate state token
    API->>Google: POST /token (exchange code)
    Google-->>API: access_token, refresh_token, expires_in

    API->>CredStore: encrypt(tokens)
    CredStore->>DB: INSERT/UPDATE credential
    API-->>Browser: 200 {"status": "authorized"}
```

---

## 4. Change Detection Detail

```mermaid
sequenceDiagram
    participant Sync as Sync Service
    participant CD as Change Detector
    participant Prev as Previous Snapshot
    participant Curr as Current Entity

    Sync->>CD: detect(previous, current)

    alt No previous snapshot
        CD->>CD: entity is NEW
        CD-->>Sync: [AssignmentCreated event]
    else Previous exists, fields differ
        CD->>CD: diff(previous.data, current.data)
        CD->>CD: identify changed fields
        CD-->>Sync: [AssignmentUpdated event with changed fields]
    else Previous exists, entity missing from fetch
        CD->>CD: entity is DELETED
        CD-->>Sync: [CalendarEventDeleted event]
    else Previous exists, no changes
        CD-->>Sync: [] (no events)
    end
```

---

## 5. Manual Sync Trigger

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant SyncService
    participant Scheduler

    Client->>API: POST /connectors/{id}/sync
    API->>API: validate connector exists
    API->>SyncService: queue_sync(connector_id)

    alt Sync already running
        SyncService-->>API: 409 Conflict
        API-->>Client: 409 {"error": "Sync already in progress"}
    else Sync available
        SyncService->>Scheduler: trigger immediate
        SyncService-->>API: sync_run_id
        API-->>Client: 202 {"sync_run_id": "...", "status": "pending"}
    end

    Note over Scheduler: Async execution begins
    Scheduler->>SyncService: execute sync (see diagram 1)
```

---

## 6. Application Startup

```mermaid
sequenceDiagram
    participant Main as main.py
    participant Config
    participant DB as Database
    participant Alembic
    participant Registry as Connector Registry
    participant EventBus
    participant Scheduler

    Main->>Config: load settings
    Main->>DB: create engine + pool
    Main->>Alembic: upgrade head (if auto_migrate)
    Main->>EventBus: initialize
    Main->>EventBus: register handlers
    Main->>Registry: register connector types
    Main->>Scheduler: load enabled connectors
    Main->>Scheduler: register cron jobs
    Main->>Scheduler: register retention jobs
    Main->>Main: start FastAPI + uvicorn
```
