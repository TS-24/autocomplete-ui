# Backend Blockers (fix in `../Autocomplete`)

The UI is built against fixtures until these are fixed. This doc is the handoff spec for
the PKS data product repo — the UI repo never patches the backend.

## Blocker 1 — No way to store connector credentials

`ConnectorCreate` accepts only `type`, `name`, `config`
(`src/pks/domain/entities/connector.py:55-62`). `CredentialRepositoryImpl.store()`
(`src/pks/infrastructure/repositories/credential_repo.py:23`) exists but is unreachable
from any API route. A connector created through the API therefore has no login, and every
real sync fails at authentication.

**Proposed fix (pick one):**
- A: extend `POST /connectors` to accept a `credential` object (type `oauth2` |
  `username_password` + `value`), storing it via `CredentialRepositoryImpl.store()`.
- B: add `POST /connectors/{connector_id}/credentials` (same storage path).

Also add a test that a real `gmail` connector can be created with a credential and that
`store()` round-trips (encrypted at rest via `infrastructure/encryption/fernet.py`).

## Blocker 2 — No Playwright Chromium in the dev container

`docker/Dockerfile.dev` installs the `playwright` Python package but never runs
`playwright install chromium` (prod `docker/Dockerfile:34-35` does). The currently running
dev container (`docker-compose.yml:23`) has no browser binary, so `POST /*/sync` fails with
"executable doesn't exist" and is recorded as a failed sync run. The ingestion path has
never scraped anything (all 90 tests use a synthetic `mock` connector).

**Fix:** add `RUN playwright install chromium --with-deps` (or
`playwright install chromium`) to `Dockerfile.dev`, rebuild, and verify a real sync against
Gmail/Calendar/D2L.

## Nice-to-haves (unblock the UI further)

- **Monotonic cursor on events** (optional, UI works around it): add
  `seq BIGSERIAL` + `?after_seq=` to `/events` and `updated_since` to `/snapshots`
  (a few lines in repo + API layer). Then the UI can switch to a clean O(new rows) cursor.
- **Scheduler runs outside dev**: `SyncScheduler` starts only when
  `APP_ENV == "development"` (`src/pks/main.py:47-49`) — looks like an oversight.
- **Fix CORS**: `allow_origins=["*"]` + `allow_credentials=True` is invalid per spec.
- **Stale docs**: `docs/data-product/` in the UI repo is a frozen copy and is currently
  stale (9 files differ, 8 missing vs `../Autocomplete/docs/`); the checked-in
  `openapi.yaml` omits all per-source endpoints. Refresh the copy after these fixes.
- **Dead Prometheus metrics**: `pks_request_count` / `pks_request_duration_seconds` are
  never incremented.
- **Log file for sync runs**: backend logs to stdout only; if a tailable log is ever
  wanted, add a FileHandler.

## Acceptance criteria for "live cutover" (Phase 6 of plan.md)

1. A connector created via the API has working credentials.
2. `POST /gmail/sync` (and calendar/d2l) succeeds end-to-end and creates `events` +
   `snapshots` rows.
3. The UI in `live` mode, pointed at `http://localhost:8001`, shows real data within one
   sync cycle (≤ 2 min).
