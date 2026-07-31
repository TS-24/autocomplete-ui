# AGENTS.md

## Project

`autocomplete-ui` is a web UI that consumes the **Personal Knowledge Stream (PKS) data product** API. The PKS backend lives in the sibling repo `../Autocomplete`.

## IMPORTANT — External Reference Docs (read first)

The `docs/data-product/` directory contains documentation **copied from the PKS data product repo** (`../Autocomplete/docs/`).

These documents are **NOT documentation for this project**. They describe the backend API this UI consumes:

- **API specs** (`docs/data-product/technical/api-specification.md`, `docs/data-product/api/usage.md`, `docs/data-product/api/openapi.yaml`) — the API you will call from this UI.
- **Design docs** (`docs/data-product/technical/architecture.md`, `domain-models.md`, `database-schema.md`, `configuration.md`, `diagrams/*`, `product/*`) — background on how the data product works. The UI never touches the PKS database directly and never reads its config.

Rules:

1. Do **not** treat `docs/data-product/` as the UI's own architecture/design documentation. The UI's own docs go elsewhere (e.g., a `docs/` section for this project, not `docs/data-product/`).
2. Do **not** modify anything under `docs/data-product/`. It is a frozen copy for reference; the source of truth is `../Autocomplete/docs/`.
3. When working on a feature, read the relevant PKS API docs to learn the endpoint contracts, then implement against the real backend.
4. If `docs/data-product/` seems out of date, check `../Autocomplete/docs/` — the `Autocomplete` version wins.
