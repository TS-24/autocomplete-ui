# autocomplete-ui Documentation

Documentation index for the `autocomplete-ui` project.

## Project Documentation

*This section describes the autocomplete-ui project itself.*

> **Start with [`plan.md`](./plan.md)** — it is the master plan and single source of truth.
> If you are an agent implementing a feature, read the relevant docs below before writing
> code, and follow the workflow in [`contributing.md`](./contributing.md).

| Document | Description |
|----------|-------------|
| [Plan](./plan.md) | Master plan: goals, non-goals, phases, acceptance criteria, decision log |
| [Architecture](./architecture.md) | Stack, process boundaries, Rust commands, security boundary, directory layout |
| [API Contract](./api-contract.md) | The PKS API as this UI consumes it; audit findings; Zod rules; fixtures |
| [Database Schema](./database-schema.md) | Drizzle schema, ownership rules, migration workflow, repo rules |
| [Sync Engine](./sync-engine.md) | Three-tier polling, watermark reconcile, correctness properties |
| [Domain Model](./domain-model.md) | Task/commitment/signal derivation, status normalization, override policy |
| [Capacity Engine](./capacity-engine.md) | Effort estimation, backward-fill scheduler, explainable ranking |
| [UI Spec](./ui.md) | Routes, view specs, component kit, design tokens, data wiring |
| [Contributing](./contributing.md) | Git workflow, stacked PRs, verification, code rules |
| [Backend Blockers](./backend-blockers.md) | What must be fixed in `../Autocomplete` for live data |

## Data Product Reference (External)

> [!WARNING]
> **The documents under `docs/data-product/` are NOT documentation for this project.**
> They are copies of the **Personal Knowledge Stream (PKS) data product** documentation
> (source: the `Autocomplete/` repo) and are provided here only as reference so that anyone
> working in this repo can understand the backend API this UI consumes.
> - Do **not** treat them as the UI's own design/architecture docs.
> - Do **not** edit them — the source of truth lives in `Autocomplete/docs/`.
> - If a doc here drifts from `Autocomplete/docs/`, the `Autocomplete/` version wins.

| Document | Description |
|----------|-------------|
| [Data Product Reference Index](./data-product/README.md) | Index of all PKS data product docs |
| [API Specification](./data-product/technical/api-specification.md) | REST endpoints and contracts |
| [API Usage Guide](./data-product/api/usage.md) | Practical examples for calling the API |
| [OpenAPI Spec](./data-product/api/openapi.yaml) | Machine-readable API definition |
| [Architecture](./data-product/technical/architecture.md) | PKS system design and data flow |
| [Domain Models](./data-product/technical/domain-models.md) | PKS entities and response shapes |
| [Database Schema](./data-product/technical/database-schema.md) | PKS PostgreSQL schema (UI never touches it directly) |
| [Product Specification](./data-product/product/product-specification.md) | What the PKS data product is |
| [ER Diagram](./data-product/diagrams/er-diagram.md) | PKS entity-relationship model |
| [Sequence Diagrams](./data-product/diagrams/sequence-diagrams.md) | PKS internal flows |
