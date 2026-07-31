# Domain Models

> [!IMPORTANT]
> **EXTERNAL REFERENCE — PKS DATA PRODUCT**
> This document describes the **PKS data product** domain models (backend in `Autocomplete/`), **not** the `autocomplete-ui` project. It exists here so UI agents understand the shapes of data the API returns. Do not modify; source of truth is `Autocomplete/docs/`.

All domain models use Pydantic v2 for validation and serialization.

---

## Core Entities

### Event

Represents something that happened in an external system.

```python
class EventType(str, Enum):
    ASSIGNMENT_CREATED = "assignment.created"
    ASSIGNMENT_UPDATED = "assignment.updated"
    GRADE_POSTED = "grade.posted"
    EMAIL_RECEIVED = "email.received"
    EMAIL_UPDATED = "email.updated"
    CALENDAR_EVENT_CREATED = "calendar_event.created"
    CALENDAR_EVENT_UPDATED = "calendar_event.updated"
    CALENDAR_EVENT_DELETED = "calendar_event.deleted"

class DomainEvent(BaseModel):
    id: UUID
    user_id: UUID
    source: str                    # connector type, e.g. "gmail"
    type: EventType
    timestamp: datetime            # when it happened externally
    payload: dict[str, Any]        # event-specific data
    metadata: EventMetadata

class EventMetadata(BaseModel):
    connector_id: UUID
    external_id: str               # ID in external system
    entity_type: str               # "assignment", "email", "calendar_event"
    sync_run_id: UUID | None = None
```

### Snapshot

Current state of an entity for change detection.

```python
class Snapshot(BaseModel):
    id: UUID
    connector_id: UUID
    entity_type: str               # "assignment", "email", "calendar_event"
    external_id: str
    data: dict[str, Any]           # normalized entity as dict
    version: int                   # increments on each update
    created_at: datetime
    updated_at: datetime
```

### Connector

Configuration for an external data source.

```python
class ConnectorType(str, Enum):
    GMAIL = "gmail"
    GOOGLE_CALENDAR = "google_calendar"
    D2L = "d2l"

class ConnectorStatus(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"
    ERROR = "error"

class Connector(BaseModel):
    id: UUID
    user_id: UUID
    type: ConnectorType
    name: str
    config: ConnectorConfig
    status: ConnectorStatus
    last_sync_at: datetime | None
    last_sync_status: SyncStatus | None
    error_count: int
    created_at: datetime
    updated_at: datetime

class ConnectorConfig(BaseModel):
    schedule: str                  # cron expression, default "*/15 * * * *"
    enabled: bool = True
    settings: dict[str, Any]       # connector-specific settings
```

### SyncRun

Record of a connector sync execution.

```python
class SyncStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"

class SyncRun(BaseModel):
    id: UUID
    connector_id: UUID
    status: SyncStatus
    started_at: datetime
    finished_at: datetime | None
    items_collected: int
    items_normalized: int
    events_created: int
    error: str | None
```

---

## Domain-Specific Entities

### Assignment (D2L)

```python
class Assignment(BaseModel):
    external_id: str
    course_name: str
    course_id: str
    title: str
    due_date: datetime | None
    status: str                    # "not submitted", "submitted", "overdue"
    url: str | None
    description: str | None
```

### Grade (D2L)

```python
class Grade(BaseModel):
    external_id: str
    course_name: str
    assignment_name: str
    score: float | None
    max_score: float | None
    percentage: float | None
    feedback: str | None
    graded_at: datetime | None
```

### Email (Gmail)

```python
class Email(BaseModel):
    external_id: str               # Gmail message ID
    thread_id: str
    subject: str
    sender: str
    recipients: list[str]
    body_text: str | None
    body_html: str | None
    labels: list[str]
    is_read: bool
    is_starred: bool
    received_at: datetime
```

### CalendarEvent (Google Calendar)

```python
class CalendarEvent(BaseModel):
    external_id: str
    calendar_id: str
    title: str
    description: str | None
    location: str | None
    start: datetime
    end: datetime
    is_all_day: bool
    attendees: list[str]
    status: str                    # "confirmed", "tentative", "cancelled"
    recurrence: str | None
```

---

## Auth Entities

### User

```python
class User(BaseModel):
    id: UUID
    email: str
    created_at: datetime
    updated_at: datetime
```

### APIKey

```python
class APIKey(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    key_prefix: str                # first 8 chars for identification
    created_at: datetime
    revoked_at: datetime | None
```

### Credential

```python
class CredentialType(str, Enum):
    OAUTH2 = "oauth2"
    USERNAME_PASSWORD = "username_password"

class Credential(BaseModel):
    id: UUID
    user_id: UUID
    connector_id: UUID
    type: CredentialType
    # Value is encrypted at rest, decrypted only in memory
    created_at: datetime
    updated_at: datetime
```

---

## Connector Interface Models

### RawPayload

Data fetched from external system before normalization.

```python
class RawPayload(BaseModel):
    connector_id: UUID
    external_id: str
    payload: dict[str, Any]
    fetched_at: datetime
    sync_run_id: UUID
```

### ConnectorHealth

```python
class ConnectorHealth(BaseModel):
    connector_id: UUID
    status: ConnectorStatus
    last_sync_at: datetime | None
    last_error: str | None
    error_count: int
    is_healthy: bool               # error_count < 3 and recent sync
```

### CollectResult

```python
class CollectResult(BaseModel):
    payloads: list[RawPayload]
    errors: list[str]
    metadata: dict[str, Any]       # e.g., new historyId for incremental sync
```

---

## API Request/Response Models

### Pagination

```python
class PaginationParams(BaseModel):
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int
```

### Event Filters

```python
class EventFilters(BaseModel):
    type: EventType | None = None
    source: str | None = None
    connector_id: UUID | None = None
    since: datetime | None = None
    until: datetime | None = None
```

### Connector Create

```python
class ConnectorCreate(BaseModel):
    type: ConnectorType
    name: str
    config: ConnectorConfig

class ConnectorUpdate(BaseModel):
    name: str | None = None
    config: ConnectorConfig | None = None
    status: ConnectorStatus | None = None
```
