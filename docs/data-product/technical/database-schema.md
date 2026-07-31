# Database Schema

> [!IMPORTANT]
> **EXTERNAL REFERENCE — PKS DATA PRODUCT**
> This document describes the **PKS data product** database (backend in `Autocomplete/`), **not** the `autocomplete-ui` project. The UI never touches this database directly — it only consumes the API. Do not modify; source of truth is `Autocomplete/docs/`.

PostgreSQL 16. All tables use UUID primary keys and `created_at`/`updated_at` timestamps.

---

## Entity-Relationship Overview

See [ER Diagram](../diagrams/er-diagram.md) for visual representation.

---

## Tables

### users

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default gen_random_uuid() |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL, default now() |
| updated_at | TIMESTAMPTZ | NOT NULL, default now() |

### api_keys

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → users.id, NOT NULL |
| name | VARCHAR(100) | NOT NULL |
| key_hash | VARCHAR(64) | NOT NULL (SHA-256) |
| key_prefix | VARCHAR(8) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| revoked_at | TIMESTAMPTZ | NULL |

**Indexes:** `idx_api_keys_user_id`, `idx_api_keys_key_hash`

### credentials

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → users.id, NOT NULL |
| connector_id | UUID | FK → connectors.id, NOT NULL |
| type | VARCHAR(50) | NOT NULL |
| encrypted_value | BYTEA | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Indexes:** `idx_credentials_connector_id`

### connectors

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → users.id, NOT NULL |
| type | VARCHAR(50) | NOT NULL |
| name | VARCHAR(100) | NOT NULL |
| config | JSONB | NOT NULL, default '{}' |
| status | VARCHAR(20) | NOT NULL, default 'active' |
| last_sync_at | TIMESTAMPTZ | NULL |
| last_sync_status | VARCHAR(20) | NULL |
| error_count | INTEGER | NOT NULL, default 0 |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Indexes:** `idx_connectors_user_id`, `idx_connectors_type`

### sync_runs

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| connector_id | UUID | FK → connectors.id, NOT NULL |
| status | VARCHAR(20) | NOT NULL |
| started_at | TIMESTAMPTZ | NOT NULL |
| finished_at | TIMESTAMPTZ | NULL |
| items_collected | INTEGER | NOT NULL, default 0 |
| items_normalized | INTEGER | NOT NULL, default 0 |
| events_created | INTEGER | NOT NULL, default 0 |
| error | TEXT | NULL |
| metadata | JSONB | default '{}' |

**Indexes:** `idx_sync_runs_connector_id`, `idx_sync_runs_started_at`

### raw_payloads

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| connector_id | UUID | FK → connectors.id, NOT NULL |
| sync_run_id | UUID | FK → sync_runs.id, NOT NULL |
| external_id | VARCHAR(255) | NOT NULL |
| payload | JSONB | NOT NULL |
| fetched_at | TIMESTAMPTZ | NOT NULL |

**Indexes:** `idx_raw_payloads_connector_id`, `idx_raw_payloads_fetched_at`
**Retention:** Delete payloads older than 30 days (scheduled job)

### snapshots

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| connector_id | UUID | FK → connectors.id, NOT NULL |
| entity_type | VARCHAR(50) | NOT NULL |
| external_id | VARCHAR(255) | NOT NULL |
| data | JSONB | NOT NULL |
| version | INTEGER | NOT NULL, default 1 |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Unique:** `uq_snapshots_connector_entity (connector_id, entity_type, external_id)`
**Indexes:** `idx_snapshots_connector_id`, `idx_snapshots_entity_type`

### events

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → users.id, NOT NULL |
| source | VARCHAR(50) | NOT NULL |
| type | VARCHAR(50) | NOT NULL |
| timestamp | TIMESTAMPTZ | NOT NULL |
| payload | JSONB | NOT NULL |
| metadata | JSONB | NOT NULL, default '{}' |
| created_at | TIMESTAMPTZ | NOT NULL |

**Indexes:**
- `idx_events_user_id`
- `idx_events_type`
- `idx_events_timestamp`
- `idx_events_source`
- `idx_events_user_type_timestamp (user_id, type, timestamp DESC)` — composite for common queries

**Note:** Events are append-only. No UPDATE or DELETE operations.

---

## Migration Strategy

- Alembic for all schema changes
- One migration per logical change
- Migrations are forward-only (no downgrade in production)
- Migration naming: `YYYYMMDD_HHMM_description.py`

### Initial Migration Order

1. `001_create_users`
2. `002_create_api_keys`
3. `003_create_connectors`
4. `004_create_credentials`
5. `005_create_sync_runs`
6. `006_create_raw_payloads`
7. `007_create_snapshots`
8. `008_create_events`

---

## JSONB Schema Examples

### events.payload (EmailReceived)

```json
{
  "subject": "Meeting tomorrow",
  "sender": "alice@example.com",
  "recipients": ["bob@example.com"],
  "is_read": false,
  "received_at": "2026-07-29T10:00:00Z"
}
```

### events.metadata

```json
{
  "connector_id": "uuid",
  "external_id": "gmail-msg-123",
  "entity_type": "email",
  "sync_run_id": "uuid"
}
```

### connectors.config

```json
{
  "schedule": "*/15 * * * *",
  "enabled": true,
  "settings": {
    "query": "is:unread",
    "label_ids": ["INBOX"]
  }
}
```

### snapshots.data (Assignment)

```json
{
  "external_id": "d2l-assign-456",
  "course_name": "CS 101",
  "title": "Homework 3",
  "due_date": "2026-08-05T23:59:00Z",
  "status": "not submitted"
}
```

---

## Performance Considerations

- Events table will grow largest; partition by month if >10M rows
- JSONB GIN indexes on `events.payload` for specific query patterns (add as needed)
- `raw_payloads` retention job prevents unbounded growth
- Connection pooling via SQLAlchemy (pool_size=5, max_overflow=10)
