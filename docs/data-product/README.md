# Personal Knowledge Stream (PKS) — Data Product Reference

> [!IMPORTANT]
> **EXTERNAL REFERENCE — NOT THE UI'S OWN DOCUMENTATION**
> These documents are copied from the **PKS data product** (`Autocomplete/` repo) and exist here so the `autocomplete-ui` team/agents can understand the backend API the UI consumes.
> They do **NOT** describe the `autocomplete-ui` project. Do not edit these files; the source of truth is `Autocomplete/docs/`.

Documentation index for the Personal Knowledge Stream platform — a deterministic ingestion layer that continuously collects, normalizes, and exposes personal data from external systems.

## Product

| Document | Description |
|----------|-------------|
| [Product Specification](./product/product-specification.md) | Executive summary, scope, requirements, architecture overview |
| [Epics](./roadmap/epics.md) | Deployable milestones broken into epics |
| [User Stories](./roadmap/user-stories.md) | Detailed stories with acceptance criteria per epic |
| [Future Roadmap](./future-roadmap.md) | Phase 2/3 connectors and long-term vision |
| [Risk Analysis](./risk-analysis.md) | Technical, operational, and product risks |

## Technical

| Document | Description |
|----------|-------------|
| [Architecture](./technical/architecture.md) | System design, components, data flow |
| [Folder Structure](./technical/folder-structure.md) | Repository layout |
| [Domain Models](./technical/domain-models.md) | Core entities and Pydantic schemas |
| [Database Schema](./technical/database-schema.md) | PostgreSQL tables, indexes, migrations |
| [API Specification](./technical/api-specification.md) | REST endpoints and contracts |
| [Background Workers](./technical/background-workers.md) | Scheduled jobs and async processing |
| [Configuration](./technical/configuration.md) | Environment variables and secrets |
| [Testing Strategy](./technical/testing-strategy.md) | Unit, integration, and E2E approach |
| [Deployment](./technical/deployment.md) | Docker, CI/CD, environments |
| [Observability](./technical/observability.md) | Logging, metrics, tracing, alerting |

## Diagrams

| Document | Description |
|----------|-------------|
| [ER Diagram](./diagrams/er-diagram.md) | Entity-relationship model |
| [Sequence Diagrams](./diagrams/sequence-diagrams.md) | Key flows (ingestion, change detection, API) |

## API

| Document | Description |
|----------|-------------|
| [OpenAPI Spec](./api/openapi.yaml) | Machine-readable API definition |
