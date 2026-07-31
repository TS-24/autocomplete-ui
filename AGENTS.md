# AGENTS.md

## Project

`autocomplete-ui` is a **Tauri v2 desktop app** (Vite + React + TypeScript frontend) that
consumes the **Personal Knowledge Stream (PKS) data product** API. The PKS backend lives in
the sibling repo `../Autocomplete` (FastAPI at `http://localhost:8001`).

## READ THESE FIRST (project docs)

The UI's own documentation lives in `docs/` (NOT `docs/data-product/`):

- **`docs/plan.md`** — master plan: goals, phases, acceptance criteria, decision log. Start here.
- **`docs/contributing.md`** — git workflow (branches, stacked PRs), verification commands, code rules.
- **`docs/architecture.md`** — stack, Rust commands, security boundary.
- **`docs/sync-engine.md`**, **`docs/database-schema.md`**, **`docs/domain-model.md`**,
  **`docs/capacity-engine.md`**, **`docs/api-contract.md`**, **`docs/ui.md`** — implementation specs.

Rules:

1. **Never commit to `main`, `dev`, or `prod` directly.** Create `feat/<task>` from `dev`,
   and when done push and open a PR to `dev` with `gh`. If the work depends on an unmerged
   PR, branch from that PR's branch and set the PR base accordingly. Do not merge PRs.
2. Before pushing a PR run: `npm run typecheck`, `npm run build`, `npm test`,
   and `cargo check` (in `src-tauri`). See `docs/contributing.md` §4.
3. DB access only through `src/db/repo/*`. No `any` outside Zod boundaries. Pure logic has
   vitest coverage.
4. When implementing, prefer the UI's own docs above; where they contradict
   `docs/data-product/`, the project docs win (they were written from a live audit).

## IMPORTANT — External Reference Docs

The `docs/data-product/` directory contains documentation **copied from the PKS data product repo** (`../Autocomplete/docs/`).

These documents are **NOT documentation for this project**. They describe the backend API this UI consumes:

- **API specs** (`docs/data-product/technical/api-specification.md`, `docs/data-product/api/usage.md`, `docs/data-product/api/openapi.yaml`) — the API you will call from this UI.
- **Design docs** (`docs/data-product/technical/architecture.md`, `domain-models.md`, `database-schema.md`, `configuration.md`, `diagrams/*`, `product/*`) — background on how the data product works. The UI never touches the PKS database directly and never reads its config.

Rules:

1. Do **not** treat `docs/data-product/` as the UI's own architecture/design documentation. The UI's own docs go elsewhere (e.g., a `docs/` section for this project, not `docs/data-product/`).
2. Do **not** modify anything under `docs/data-product/`. It is a frozen copy for reference; the source of truth is `../Autocomplete/docs/`.
3. When working on a feature, read the relevant PKS API docs to learn the endpoint contracts, then implement against the real backend.
4. If `docs/data-product/` seems out of date, check `../Autocomplete/docs/` — the `Autocomplete` version wins.
5. The checked-in `openapi.yaml` is stale; for endpoint contracts use the **live** `http://localhost:8001/openapi.json` and `docs/api-contract.md` (written from the live API).
6. The backend has never ingested real data (no credential endpoint; no Playwright browser in dev). Develop against fixtures (`src/lib/pks/fixtures.ts`); live mode requires `docs/backend-blockers.md` fixes.

## Environment

- Node 26 + Rust 1.97 installed but NOT on the default PATH in non-interactive shells:
  `export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"`
