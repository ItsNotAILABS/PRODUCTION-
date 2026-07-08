# Database Migrations with Alembic

This project uses [Alembic](https://alembic.sqlalchemy.org/) to manage database schema evolution safely and version-controlled.

## Architecture

- **alembic/**: Migration configuration and versioned migration scripts
- **alembic/versions/**: Individual migration files (001_initial_schema.py, 002_*.py, etc.)
- **alembic.ini**: Alembic configuration (sqlalchemy.url is set from DATABASE_URL env var at runtime)
- **app/database.py**: `init_db()` runs Alembic's `upgrade head` on app startup

## Running Migrations

### Automatic (on app startup)
When the FastAPI app starts, `init_db()` is called via the lifespan context manager, which runs all pending migrations automatically. This happens in:
- `run_local.sh` (local development)
- Gunicorn startup in docker-compose.yml / docker-compose.prod.yml
- Cloudflare Container startup (supervisord)

### Manual (CLI)
To apply migrations manually from the command line:

```bash
cd core-api
alembic upgrade head       # Apply all pending migrations
alembic current            # Show current revision
alembic downgrade -1       # Rollback one migration (rarely needed)
alembic history            # View all migrations
```

## Creating New Migrations

When you modify models in `app/db_models.py`, Alembic can auto-generate the migration:

```bash
cd core-api
alembic revision --autogenerate -m "Add user.timezone column"
```

This creates a new file in `alembic/versions/` with the detected changes. Always review the generated migration file to ensure it's correct, then test it:

```bash
alembic upgrade head       # Test forward
alembic downgrade -1       # Test backward
alembic upgrade head       # Go forward again
```

For complex changes (e.g., data migrations, custom logic), edit the migration file manually after generation.

## Migration Naming

Files follow the pattern: `{revision}_{slug}.py`
- `001_initial_schema.py` — The foundational schema
- `002_add_user_timezone.py` — A new feature
- `003_backfill_user_timezone_utc.py` — Data migration supporting the above

Keep slugs short, descriptive, and lowercase. Each migration should be independent and idempotent (safe to run multiple times).

## Testing Migrations

Before pushing a migration:

1. **Forward**: Apply the migration with `alembic upgrade head` and verify the schema is correct
2. **Backward**: Rollback with `alembic downgrade -1` and verify you're back to the prior schema
3. **Forward again**: Re-apply to ensure it's idempotent
4. **In app context**: Run the app with `run_local.sh` or docker-compose to ensure init_db() succeeds

## Rollback Strategy

Alembic allows downgrades, but in production they should be rare. Instead:
- **For breaking changes**: Create a new migration that fixes the schema without deleting data
- **For data loss**: Create a data migration that populates defaults before adding NOT NULL constraints
- **For rollback**: Use `alembic downgrade -1` only in development or after careful review

## Environment Configuration

The DATABASE_URL is read from the environment at runtime:
- **Local dev**: `sqlite:///data/command_center.db` (default if not set)
- **Production**: `postgresql+psycopg2://user:pass@host/dbname` (set in `.env` or container secrets)

alembic.ini does not hardcode the database URL; it's injected by `app/database.py:init_db()`.

## Troubleshooting

**"FAILED: No such table"**
- The app is running with an old alembic.ini or the migrations directory is missing. Verify the alembic/ directory exists and alembic.ini points to it.

**"Target database is not up to date"**
- Run `alembic upgrade head` to apply pending migrations.

**"Can't find migration X"**
- Ensure the file exists in alembic/versions/ and its revision ID matches what Alembic sees with `alembic history`.

**"Conflict: two migrations with the same down_revision"**
- Use `alembic merge` to combine branches (rare — keep a linear history).
