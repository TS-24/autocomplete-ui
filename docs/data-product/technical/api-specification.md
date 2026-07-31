# API Specification

> [!IMPORTANT]
> **EXTERNAL REFERENCE — PKS DATA PRODUCT**
> This document describes the **PKS data product** API (backend in `Autocomplete/`), **not** the `autocomplete-ui` project. It exists here so UI agents can consume the API correctly. Do not modify; source of truth is `Autocomplete/docs/`.

Base URL: `/api/v1`

Authentication: `X-API-Key` header on all endpoints except `/health` and OAuth callbacks.

---

## Health

### GET /health

No authentication required.

**Response 200:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "database": "connected",
  "uptime_seconds": 3600
}
```

---

## Authentication

### POST /auth/keys

Create a new API key.

**Request:**
```json
{
  "name": "my-agent-key"
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "name": "my-agent-key",
  "key": "pks_abc123...",
  "key_prefix": "pks_abc1",
  "created_at": "2026-07-29T10:00:00Z"
}
```

**Note:** `key` is returned only once. Store it securely.

### GET /auth/keys

List API keys (masked).

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "my-agent-key",
      "key_prefix": "pks_abc1",
      "created_at": "2026-07-29T10:00:00Z",
      "revoked_at": null
    }
  ],
  "total": 1
}
```

### DELETE /auth/keys/{key_id}

Revoke an API key.

**Response 204:** No content.

### GET /auth/google/authorize

> **Deprecated:** Google OAuth2 flow is no longer used in Phase 1. Gmail and
> Calendar are collected via Playwright browser automation using stored login
> credentials. This endpoint is retained in the spec for a future API-based
> optimization and is not implemented in Phase 1.

### GET /auth/google/callback

> **Deprecated:** See note above. Not implemented in Phase 1.

---

## Events

### GET /events

Query events with filters and pagination.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| type | string | Event type filter (e.g., `email.received`) |
| source | string | Connector source (e.g., `gmail`) |
| connector_id | uuid | Filter by connector |
| since | datetime | Events after this time (ISO 8601) |
| until | datetime | Events before this time |
| limit | int | Page size (default 50, max 200) |
| offset | int | Page offset (default 0) |

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "source": "gmail",
      "type": "email.received",
      "timestamp": "2026-07-29T09:30:00Z",
      "payload": {
        "subject": "Meeting tomorrow",
        "sender": "alice@example.com",
        "is_read": false
      },
      "metadata": {
        "connector_id": "uuid",
        "external_id": "msg-123",
        "entity_type": "email"
      },
      "created_at": "2026-07-29T09:31:00Z"
    }
  ],
  "total": 142,
  "limit": 50,
  "offset": 0
}
```

### GET /events/{event_id}

Get a single event.

**Response 200:** Single event object.

**Response 404:** Event not found.

---

## Snapshots

### GET /snapshots

Query current entity snapshots.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| connector_id | uuid | Filter by connector |
| entity_type | string | Filter by entity type |
| external_id | string | Filter by external ID |
| limit | int | Page size |
| offset | int | Page offset |

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "connector_id": "uuid",
      "entity_type": "email",
      "external_id": "msg-123",
      "data": {
        "subject": "Meeting tomorrow",
        "sender": "alice@example.com",
        "is_read": true
      },
      "version": 2,
      "updated_at": "2026-07-29T10:00:00Z"
    }
  ],
  "total": 50,
  "limit": 50,
  "offset": 0
}
```

### GET /snapshots/{snapshot_id}

Get a single snapshot.

**Response 200:** Single snapshot object.

---

## Connectors

### POST /connectors

Register a new connector.

**Request:**
```json
{
  "type": "gmail",
  "name": "My Gmail",
  "config": {
    "schedule": "*/15 * * * *",
    "enabled": true,
    "settings": {
      "query": "is:unread"
    }
  }
}
```

**Response 201:** Connector object.

### GET /connectors

List all connectors.

**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "type": "gmail",
      "name": "My Gmail",
      "status": "active",
      "last_sync_at": "2026-07-29T09:45:00Z",
      "last_sync_status": "success",
      "error_count": 0,
      "config": { "schedule": "*/15 * * * *", "enabled": true },
      "created_at": "2026-07-28T10:00:00Z"
    }
  ],
  "total": 3
}
```

### GET /connectors/{connector_id}

Get connector details.

**Response 200:** Connector object.

### PATCH /connectors/{connector_id}

Update connector configuration.

**Request:**
```json
{
  "name": "Updated Name",
  "config": {
    "enabled": false
  }
}
```

**Response 200:** Updated connector object.

### DELETE /connectors/{connector_id}

Remove a connector and its credentials.

**Response 204:** No content.

### POST /connectors/{connector_id}/sync

Manually trigger a sync.

**Response 202:**
```json
{
  "sync_run_id": "uuid",
  "status": "pending",
  "message": "Sync queued"
}
```

### GET /connectors/{connector_id}/health

Get detailed connector health.

**Response 200:**
```json
{
  "connector_id": "uuid",
  "status": "active",
  "is_healthy": true,
  "last_sync_at": "2026-07-29T09:45:00Z",
  "last_sync_status": "success",
  "last_error": null,
  "error_count": 0,
  "recent_syncs": [
    {
      "id": "uuid",
      "status": "success",
      "started_at": "2026-07-29T09:45:00Z",
      "finished_at": "2026-07-29T09:45:30Z",
      "items_collected": 5,
      "events_created": 2
    }
  ]
}
```

### GET /connectors/{connector_id}/sync-runs

List sync run history.

**Query params:** limit, offset

**Response 200:** Paginated list of sync runs.

---

## Per-Source Endpoints

Each Phase 1 data source exposes 2-3 dedicated REST endpoints. List/detail
endpoints read from normalized snapshots (no live scrape). The `sync` endpoint
triggers a Playwright collection cycle. All require API key authentication.

### Gmail

#### GET /gmail/messages

List normalized email messages from the latest Gmail snapshot.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| is_read | bool | Filter by read status |
| since | datetime | Messages after this time |
| until | datetime | Messages before this time |
| limit | int | Page size (default 50, max 200) |
| offset | int | Page offset (default 0) |

**Response 200:**
```json
{
  "items": [
    {
      "external_id": "msg-123",
      "subject": "Meeting tomorrow",
      "sender": "alice@example.com",
      "is_read": false,
      "received_at": "2026-07-29T09:30:00Z"
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

#### GET /gmail/messages/{external_id}

Get a single email message by external ID.

**Response 200:** Single message object (includes body preview).
**Response 404:** Message not found.

#### POST /gmail/sync

Trigger a Gmail Playwright collection cycle.

**Response 202:**
```json
{
  "sync_run_id": "uuid",
  "status": "pending",
  "message": "Gmail sync queued"
}
```

---

### Google Calendar

#### GET /calendar/events

List normalized calendar events from the latest Calendar snapshot.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| time_min | datetime | Events starting after this time |
| time_max | datetime | Events starting before this time |
| limit | int | Page size (default 50, max 200) |
| offset | int | Page offset (default 0) |

**Response 200:**
```json
{
  "items": [
    {
      "external_id": "evt-456",
      "title": "Team standup",
      "start": "2026-07-30T09:00:00Z",
      "end": "2026-07-30T09:30:00Z",
      "location": "Zoom",
      "attendees": ["alice@example.com", "bob@example.com"]
    }
  ],
  "total": 15,
  "limit": 50,
  "offset": 0
}
```

#### GET /calendar/events/{external_id}

Get a single calendar event by external ID.

**Response 200:** Single event object.
**Response 404:** Event not found.

#### POST /calendar/sync

Trigger a Google Calendar Playwright collection cycle.

**Response 202:**
```json
{
  "sync_run_id": "uuid",
  "status": "pending",
  "message": "Calendar sync queued"
}
```

---

### D2L / Brightspace

#### GET /d2l/assignments

List normalized assignments from the latest D2L snapshot.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| course | string | Filter by course name |
| due_before | datetime | Assignments due before this time |
| due_after | datetime | Assignments due after this time |
| limit | int | Page size (default 50, max 200) |
| offset | int | Page offset (default 0) |

**Response 200:**
```json
{
  "items": [
    {
      "external_id": "asg-789",
      "name": "Problem Set 3",
      "course": "CS 101",
      "due_at": "2026-08-02T23:59:00Z",
      "status": "not_started"
    }
  ],
  "total": 8,
  "limit": 50,
  "offset": 0
}
```

#### GET /d2l/grades

List normalized grades from the latest D2L snapshot.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| course | string | Filter by course name |
| limit | int | Page size (default 50, max 200) |
| offset | int | Page offset (default 0) |

**Response 200:**
```json
{
  "items": [
    {
      "external_id": "grd-101",
      "assignment": "Problem Set 2",
      "course": "CS 101",
      "score": 45.0,
      "max_score": 50.0,
      "feedback": "Good work on Q3."
    }
  ],
  "total": 6,
  "limit": 50,
  "offset": 0
}
```

#### POST /d2l/sync

Trigger a D2L Playwright collection cycle (assignments + grades).

**Response 202:**
```json
{
  "sync_run_id": "uuid",
  "status": "pending",
  "message": "D2L sync queued"
}
```

---

## Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Event not found",
    "details": {}
  }
}
```

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | VALIDATION_ERROR | Invalid request body or params |
| 401 | UNAUTHORIZED | Missing or invalid API key |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | Duplicate resource |
| 429 | RATE_LIMITED | Too many requests |
| 500 | INTERNAL_ERROR | Unexpected server error |

---

## Rate Limiting

- 100 requests per minute per API key
- Headers on all responses:
  - `X-RateLimit-Limit: 100`
  - `X-RateLimit-Remaining: 95`
  - `X-RateLimit-Reset: 1627560000`

---

## Pagination

All list endpoints support:
- `limit` (default 50, max 200)
- `offset` (default 0)

Response includes `total` count for client-side pagination UI.
