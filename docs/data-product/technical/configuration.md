# Configuration

> [!IMPORTANT]
> **EXTERNAL REFERENCE — PKS DATA PRODUCT**
> This document describes **PKS data product** configuration (backend in `Autocomplete/`), **not** the `autocomplete-ui` project. These variables belong to the data product, not the UI. Do not modify; source of truth is `Autocomplete/docs/`.

All configuration via environment variables. Pydantic `BaseSettings` loads from `.env` file in development.

---

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://pks:pks@localhost:5432/pks` |
| `ENCRYPTION_KEY` | Fernet key for credential encryption | `(generate with Fernet.generate_key())` |
| `SECRET_KEY` | App secret for session/state signing | `(random 32+ char string)` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_ENV` | Environment name | `development` |
| `LOG_LEVEL` | Logging level | `INFO` |
| `API_HOST` | Server bind host | `0.0.0.0` |
| `API_PORT` | Server bind port | `8000` |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | `*` |
| `DEFAULT_SYNC_SCHEDULE` | Default connector cron | `*/15 * * * *` |
| `MAX_CONCURRENT_SYNCS` | Max parallel syncs | `3` |
| `RAW_PAYLOAD_RETENTION_DAYS` | Days to keep raw payloads | `30` |
| `RATE_LIMIT_PER_MINUTE` | API rate limit | `100` |
| `AUTO_MIGRATE` | Run Alembic on startup | `true` (dev), `false` (prod) |

### Google OAuth (Epic 5+)

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL |

### D2L (Epic 7+)

| Variable | Description |
|----------|-------------|
| `D2L_BASE_URL` | D2L instance URL (e.g., `https://learn.example.edu`) |

---

## Settings Class

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str
    encryption_key: str
    secret_key: str
    log_level: str = "INFO"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "*"
    default_sync_schedule: str = "*/15 * * * *"
    max_concurrent_syncs: int = 3
    raw_payload_retention_days: int = 30
    rate_limit_per_minute: int = 100
    auto_migrate: bool = True

    # Google OAuth
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str | None = None

    # D2L
    d2l_base_url: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]
```

---

## Secrets Management

### Development

- `.env` file (gitignored)
- `.env.example` committed with placeholder values

### Production

- Environment variables injected by deployment platform
- Never commit secrets to version control
- Rotate `ENCRYPTION_KEY` requires re-encrypting all credentials

### Generating Keys

```bash
# Encryption key
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Secret key
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## .env.example

```env
# Application
APP_ENV=development
LOG_LEVEL=INFO
SECRET_KEY=change-me-to-a-random-string

# Database
DATABASE_URL=postgresql+asyncpg://pks:pks@localhost:5432/pks

# Encryption
ENCRYPTION_KEY=change-me-generate-with-fernet

# API
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:3000

# Sync
DEFAULT_SYNC_SCHEDULE=*/15 * * * *
MAX_CONCURRENT_SYNCS=3

# Google OAuth (optional, needed for Gmail/Calendar)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback

# D2L (optional)
D2L_BASE_URL=https://learn.example.edu
```

---

## Docker Compose Environment

```yaml
services:
  api:
    environment:
      - DATABASE_URL=postgresql+asyncpg://pks:pks@postgres:5432/pks
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - SECRET_KEY=${SECRET_KEY}
    env_file:
      - .env
```

Secrets in `.env` are loaded by Docker Compose but never baked into the image.
