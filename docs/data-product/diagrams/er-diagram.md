# ER Diagram

> [!IMPORTANT]
> **EXTERNAL REFERENCE — PKS DATA PRODUCT**
> This diagram describes the **PKS data product** database (backend in `Autocomplete/`), **not** the `autocomplete-ui` project. Reference only; do not modify. Source of truth: `Autocomplete/docs/`.

```mermaid
erDiagram
    users ||--o{ api_keys : has
    users ||--o{ connectors : owns
    users ||--o{ events : receives
    users ||--o{ credentials : stores

    connectors ||--o{ credentials : uses
    connectors ||--o{ sync_runs : executes
    connectors ||--o{ raw_payloads : collects
    connectors ||--o{ snapshots : maintains

    sync_runs ||--o{ raw_payloads : produces

    users {
        uuid id PK
        varchar email UK
        timestamptz created_at
        timestamptz updated_at
    }

    api_keys {
        uuid id PK
        uuid user_id FK
        varchar name
        varchar key_hash
        varchar key_prefix
        timestamptz created_at
        timestamptz revoked_at
    }

    connectors {
        uuid id PK
        uuid user_id FK
        varchar type
        varchar name
        jsonb config
        varchar status
        timestamptz last_sync_at
        varchar last_sync_status
        int error_count
        timestamptz created_at
        timestamptz updated_at
    }

    credentials {
        uuid id PK
        uuid user_id FK
        uuid connector_id FK
        varchar type
        bytea encrypted_value
        timestamptz created_at
        timestamptz updated_at
    }

    sync_runs {
        uuid id PK
        uuid connector_id FK
        varchar status
        timestamptz started_at
        timestamptz finished_at
        int items_collected
        int items_normalized
        int events_created
        text error
        jsonb metadata
    }

    raw_payloads {
        uuid id PK
        uuid connector_id FK
        uuid sync_run_id FK
        varchar external_id
        jsonb payload
        timestamptz fetched_at
    }

    snapshots {
        uuid id PK
        uuid connector_id FK
        varchar entity_type
        varchar external_id
        jsonb data
        int version
        timestamptz created_at
        timestamptz updated_at
    }

    events {
        uuid id PK
        uuid user_id FK
        varchar source
        varchar type
        timestamptz timestamp
        jsonb payload
        jsonb metadata
        timestamptz created_at
    }
```

## Relationships

| From | To | Cardinality | Description |
|------|----|-------------|-------------|
| users | api_keys | 1:N | User can have multiple API keys |
| users | connectors | 1:N | User owns connectors |
| users | events | 1:N | Events belong to user |
| users | credentials | 1:N | User has credentials |
| connectors | credentials | 1:1 | Each connector has credentials |
| connectors | sync_runs | 1:N | Connector has sync history |
| connectors | raw_payloads | 1:N | Connector collects payloads |
| connectors | snapshots | 1:N | Connector maintains snapshots |
| sync_runs | raw_payloads | 1:N | Sync run produces payloads |

## Key Constraints

- `api_keys.key_hash` — unique index for fast lookup
- `snapshots (connector_id, entity_type, external_id)` — unique, one snapshot per entity
- `events` — append-only, no FK to snapshots (events are immutable history)
- `credentials.encrypted_value` — BYTEA, never queried by value

## Index Strategy

```
events:
  idx_events_user_type_timestamp (user_id, type, timestamp DESC)  -- primary query pattern
  idx_events_source (source)
  idx_events_timestamp (timestamp DESC)

snapshots:
  uq_snapshots_connector_entity (connector_id, entity_type, external_id)  -- upsert target

connectors:
  idx_connectors_user_id (user_id)
  idx_connectors_type (type)

sync_runs:
  idx_sync_runs_connector_started (connector_id, started_at DESC)

raw_payloads:
  idx_raw_payloads_fetched_at (fetched_at)  -- retention cleanup
```
