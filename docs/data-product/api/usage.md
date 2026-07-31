# PKS API Usage Guide

> [!IMPORTANT]
> **EXTERNAL REFERENCE — PKS DATA PRODUCT**
> This document describes the **PKS data product** API (backend in `Autocomplete/`), **not** the `autocomplete-ui` project. It exists here so UI agents can consume the API correctly. Do not modify; source of truth is `Autocomplete/docs/`.

Practical guide for calling the PKS (Personal Knowledge Stream) REST API.
Reference specs live in `docs/technical/api-specification.md` (design spec) and
`docs/api/openapi.yaml` (generated OpenAPI). This guide matches the implemented code.

- **Base URL:** `http://localhost:8001/api/v1` (Docker dev setup)
- **Interactive docs:** http://localhost:8001/docs (Swagger UI) · http://localhost:8001/redoc
- **Raw spec:** http://localhost:8001/openapi.json

All request/response bodies are JSON. All timestamps are ISO 8601.

---

## 1. Authentication

Every endpoint except `/health`, `/docs`, `/redoc`, `/openapi.json`, and `/metrics`
requires an API key sent as an HTTP header:

```
X-API-Key: pks_<your-key>
```

### Get your first key (no auth required)

```bash
curl -X POST http://localhost:8001/api/v1/auth/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agent"}'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string (1-100 chars) | yes | Human-readable label for the key |

**Response 201:**

```json
{
  "id": "0f8a9c2e-...",
  "name": "my-agent",
  "key": "pks_Ab3xY9...",
  "key_prefix": "pks_Ab3xY",
  "created_at": "2026-07-31T13:00:00Z"
}
```

> **Important:** the plaintext `key` is returned only in this response. It is stored
> hashed and cannot be retrieved again. Store it securely. Max 10 active keys per user.

### List keys

```bash
curl http://localhost:8001/api/v1/auth/keys -H "X-API-Key: pks_..."
```

Returns `{ "items": [...], "total": n }` with masked keys (`key_prefix`, no plaintext).

### Revoke a key

```bash
curl -X DELETE http://localhost:8001/api/v1/auth/keys/{key_id} \
  -H "X-API-Key: pks_..."
```

Returns `204 No Content`. The key stops authenticating immediately. `404` if the id is unknown.

---

## 2. Rate Limiting

- **100 requests per minute** per API key (configurable via `RATE_LIMIT_PER_MINUTE`).
- Every response carries: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- Exceeding the limit returns **429** with `Retry-After` (seconds):
  - `{"error": {"code": "RATE_LIMITED", "message": "Too many requests"}}`

Health, metrics, and docs endpoints are exempt.

---

## 3. System

### GET /health — no auth

```bash
curl http://localhost:8001/api/v1/health
```

```json
{
  "status": "ok",
  "version": "0.1.0",
  "database": "connected",
  "uptime_seconds": 3600.0
}
```

`status` is `ok` when the DB is reachable, `degraded` otherwise.

### GET /metrics — no auth, Prometheus format

```bash
curl http://localhost:8001/metrics
```

Prometheus text format: request counts/durations, sync durations/errors, events created.

---

## 4. Connectors

Connectors represent a data source. Supported `type` values (Phase 1):

| Type | Source |
|------|--------|
| `gmail` | Gmail |
| `google_calendar` | Google Calendar |
| `d2l` | D2L / Brightspace |

Connector `status` values: `active` | `disabled` | `error`.

### Create a connector

```bash
curl -X POST http://localhost:8001/api/v1/connectors \
  -H "X-API-Key: pks_..." -H "Content-Type: application/json" \
  -d '{
    "type": "gmail",
    "name": "My Gmail",
    "config": {
      "schedule": "*/15 * * * *",
      "enabled": true,
      "settings": {}
    }
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | string | yes | One of: `gmail`, `google_calendar`, `d2l` |
| name | string (1-100 chars) | yes | Display name |
| config | object | no | `schedule` (cron, default `*/15 * * * *`), `enabled` (bool, default true), `settings` (free-form dict) |

**Response 201** — connector object (see below). `422 INVALID_CONNECTOR_TYPE` if type is not registered.

### Connector object shape (all CRUD responses)

```json
{
  "id": "uuid",
  "type": "gmail",
  "name": "My Gmail",
  "status": "active",
  "last_sync_at": "2026-07-31T10:00:00Z",
  "last_sync_status": "success",
  "error_count": 0,
  "config": {"schedule": "*/15 * * * *", "enabled": true, "settings": {}},
  "created_at": "2026-07-31T09:00:00Z",
  "updated_at": "2026-07-31T10:00:00Z"
}
```

### List connectors

```bash
curl http://localhost:8001/api/v1/connectors -H "X-API-Key: pks_..."
```

Returns `{ "items": [connector...], "total": n }`.

### Get a connector

```bash
curl http://localhost:8001/api/v1/connectors/{connector_id} -H "X-API-Key: pks_..."
```

`404` if not found.

### Update a connector (PATCH — partial updates)

```bash
curl -X PATCH http://localhost:8001/api/v1/connectors/{connector_id} \
  -H "X-API-Key: pks_..." -H "Content-Type: application/json" \
  -d '{"status": "disabled"}'
```

Any subset of `name`, `config`, `status` may be sent. Returns the updated connector.

### Delete a connector

```bash
curl -X DELETE http://localhost:8001/api/v1/connectors/{connector_id} \
  -H "X-API-Key: pks_..."
```

`204 No Content`. Also removes the connector's stored credentials.

### Trigger a sync manually

```bash
curl -X POST http://localhost:8001/api/v1/connectors/{connector_id}/sync \
  -H "X-API-Key: pks_..."
```

**Response 202:**

```json
{
  "sync_run_id": "uuid",
  "status": "pending",
  "message": "Sync completed"
}
```

`status` is one of `pending` | `running` | `success` | `failed`.
`409 SYNC_IN_PROGRESS` if a sync for this connector is already running.

### Connector health

```bash
curl http://localhost:8001/api/v1/connectors/{connector_id}/health \
  -H "X-API-Key: pks_..."
```

```json
{
  "connector_id": "uuid",
  "status": "active",
  "is_healthy": true,
  "last_sync_at": "2026-07-31T10:00:00Z",
  "last_sync_status": "success",
  "last_error": null,
  "error_count": 0
}
```

### Sync run history

```bash
curl "http://localhost:8001/api/v1/connectors/{connector_id}/sync-runs?limit=20&offset=0" \
  -H "X-API-Key: pks_..."
```

Returns `{ "items": [sync_run...], "total": n, "limit": 20, "offset": 0 }`.
Sync run shape: `id`, `connector_id`, `status`, `started_at`, `finished_at`,
`items_collected`, `items_normalized`, `events_created`, `error`, `metadata`.

---

## 5. Events

Events are immutable change records produced by syncs. `type` values:

`assignment.created` · `assignment.updated` · `grade.posted` · `email.received` ·
`email.updated` · `calendar_event.created` · `calendar_event.updated` · `calendar_event.deleted`

### List events

```bash
curl "http://localhost:8001/api/v1/events?type=email.received&since=2026-07-30T00:00:00&limit=50" \
  -H "X-API-Key: pks_..."
```

**Query params (all optional):**

| Param | Description |
|-------|-------------|
| type | Event type filter (e.g. `email.received`) |
| source | Connector source filter (e.g. `gmail`) |
| connector_id | Filter by connector UUID |
| since | ISO 8601 datetime — events after this time |
| until | ISO 8601 datetime — events before this time |
| limit | Page size, default 50, max 200 |
| offset | Page offset, default 0 |

**Response 200:**

```json
{
  "items": [
    {
      "id": "uuid",
      "source": "gmail",
      "type": "email.received",
      "timestamp": "2026-07-31T09:30:00Z",
      "payload": {"subject": "Meeting tomorrow", "sender": "alice@example.com"},
      "metadata": {"connector_id": "uuid", "external_id": "msg-123", "entity_type": "email", "sync_run_id": "uuid"},
      "created_at": "2026-07-31T09:31:00Z"
    }
  ],
  "total": 142,
  "limit": 50,
  "offset": 0
}
```

### Get a single event

```bash
curl http://localhost:8001/api/v1/events/{event_id} -H "X-API-Key: pks_..."
```

`404` if not found.

---

## 6. Snapshots

Snapshots are the latest normalized state of each entity. `entity_type` values:
`email` · `calendar_event` · `assignment` · `grade`.

### List snapshots

```bash
curl "http://localhost:8001/api/v1/snapshots?connector_id={id}&entity_type=email&limit=50" \
  -H "X-API-Key: pks_..."
```

**Query params (all optional):** `connector_id`, `entity_type`, `external_id`, `limit` (default 50, max 200), `offset`.

**Response 200:**

```json
{
  "items": [
    {
      "id": "uuid",
      "connector_id": "uuid",
      "entity_type": "email",
      "external_id": "msg-123",
      "data": {"subject": "Meeting tomorrow", "sender": "alice@example.com", "is_read": true},
      "version": 2,
      "updated_at": "2026-07-31T09:30:00Z"
    }
  ],
  "total": 50,
  "limit": 50,
  "offset": 0
}
```

### Get a single snapshot

```bash
curl http://localhost:8001/api/v1/snapshots/{snapshot_id} -H "X-API-Key: pks_..."
```

`404` if not found.

---

## 7. Per-Source Endpoints

Each source has convenience endpoints reading from its latest snapshots.
List/detail reads never trigger scraping — only `POST .../sync` does.

### Gmail

```bash
# List messages
curl "http://localhost:8001/api/v1/gmail/messages?limit=50&offset=0" -H "X-API-Key: pks_..."

# Get one message (external_id is the source's own id)
curl http://localhost:8001/api/v1/gmail/messages/{external_id} -H "X-API-Key: pks_..."

# Trigger a Playwright collection cycle
curl -X POST http://localhost:8001/api/v1/gmail/sync -H "X-API-Key: pks_..."
```

List item: `external_id`, `subject`, `sender`, `is_read`, `received_at`, `snippet`.
Detail adds: `recipients`, `body_text`, `body_html`, `is_starred`, `version`, `updated_at`.

### Google Calendar

```bash
curl "http://localhost:8001/api/v1/calendar/events?limit=50" -H "X-API-Key: pks_..."
curl http://localhost:8001/api/v1/calendar/events/{external_id} -H "X-API-Key: pks_..."
curl -X POST http://localhost:8001/api/v1/calendar/sync -H "X-API-Key: pks_..."
```

List item: `external_id`, `title`, `start`, `end`, `location`, `attendees`.
Detail adds: `description`, `is_all_day`, `status`, `version`, `updated_at`.

### D2L / Brightspace

```bash
curl "http://localhost:8001/api/v1/d2l/assignments?limit=50" -H "X-API-Key: pks_..."
curl "http://localhost:8001/api/v1/d2l/grades?limit=50" -H "X-API-Key: pks_..."
curl -X POST http://localhost:8001/api/v1/d2l/sync -H "X-API-Key: pks_..."
```

Assignment: `external_id`, `name`, `course`, `due_at`, `status`.
Grade: `external_id`, `assignment`, `course`, `score`, `max_score`, `feedback`.

All `POST .../sync` endpoints return **202** `{ "sync_run_id", "status", "message" }`
and `409 SYNC_IN_PROGRESS` if already running.

> Note: `POST /sync` requires the corresponding connector to exist and be registered,
> otherwise `404`.

---

## 8. Pagination

All list endpoints support `limit` (default 50, max 200) and `offset` (default 0).
Responses include `total` for the full match count:

```json
{ "items": [...], "total": 142, "limit": 50, "offset": 0 }
```

---

## 9. Errors

Errors use a consistent envelope:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Event not found"
  }
}
```

| HTTP | Code | Meaning |
|------|------|---------|
| 401 | UNAUTHORIZED | Missing, invalid, or revoked API key |
| 404 | NOT_FOUND | Resource (connector, event, snapshot, key) not found |
| 409 | TOO_MANY_KEYS | Max 10 active API keys reached |
| 409 | SYNC_IN_PROGRESS | A sync for this connector is already running |
| 409 | NO_USER | No user bootstrapped yet (restart app) |
| 422 | INVALID_CONNECTOR_TYPE | Connector `type` not registered |
| 429 | RATE_LIMITED | Rate limit exceeded (100 req/min) |
| 500 | INTERNAL_ERROR | Unexpected server error |

---

## 10. Quick Start (Docker)

```bash
# Start the stack
docker compose -f docker/docker-compose.yml up --build -d

# Verify
curl http://localhost:8001/api/v1/health

# Create your first API key
curl -X POST http://localhost:8001/api/v1/auth/keys \
  -H "Content-Type: application/json" -d '{"name": "my-agent"}'
```

Then use the returned `key` value with `-H "X-API-Key: pks_..."` on all other calls.
