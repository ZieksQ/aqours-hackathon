# Production deployment runbook

> **Verification status:** `compose.production.yaml`, the production environment example, API hosting integration, and API/web image files are implemented. The API build and all 15 focused production-hosting tests passed; production and development Compose model checks and shell syntax checks also passed. `nginx -t` was unavailable because the Nginx binary is not installed; Docker image builds, container startup, database migrations, live authentication/data retention, and an actual production deployment were not verified because Docker daemon access was denied. Validate these instructions in staging before a production rollout.

## Target and network boundary

The approved target is a single native Linux host running a production-only Compose project. It sits behind the organization's existing HTTPS edge proxy; this repository does not automate certificates or configure that edge. The Docker development stack remains separate, and the production services must not reuse development volumes or development data.

The current Compose model names the services `db`, `api`, `web`, and profile-gated `migrate` in project `aqours-production`. The web service publishes `127.0.0.1:${PROD_WEB_PORT:-8080}:8080` for the existing HTTPS edge. The API is attached to the `proxy` and `database` networks, while the database is attached only to the internal `database` network; neither the API nor database publishes a host port. The default proxy and database subnets are `172.30.0.0/24` and `172.31.0.0/24`, configurable with `PROD_PROXY_CIDR` and `PROD_DATABASE_CIDR`. The PostgreSQL container uses an independent `production-database` volume; the database name defaults to `aqours`, which does not reuse the development database because the Compose volume and project are separate.

The existing HTTPS edge terminates TLS on the public HTTPS listener (port 443) and routes to the loopback web port while preserving the public `Host`. It should strip or overwrite client-supplied forwarded headers. Nginx then sets `X-Forwarded-Host` from the public host and sets `X-Forwarded-Proto` to `https` for the API. The API production host validates `PROD_PUBLIC_HOST`, allows that host, trusts only `PROD_PROXY_CIDR`, accepts one forwarded host/proto hop, and applies forwarded headers before HTTPS redirection. Redirects target port 443; `/health` is excluded for the internal HTTP probe. `PROD_PROXY_CIDR` must parse as IPv4 with a prefix from `/16` through `/30`; use the same subnet as the Compose `proxy` network.

The Nginx configuration serves the built SPA, routes same-origin `/api` requests and SignalR WebSocket upgrades to `api:8080`, and sets the forwarded host and HTTPS scheme headers. It rejects unknown hosts, disables caching for the SPA entry document, returns 404 for missing static assets, and applies immutable cache headers to successful `/assets/` responses. Access logs record method and URI without query strings; Nginx API proxy error logs are suppressed to avoid query-bearing diagnostics such as SignalR `access_token` URLs. API application errors still go to the container log; avoid adding request-query or secret-header logging. The static web health endpoint is `/healthz`; the API health probe behavior is described below. Neither Docker health probe has been exercised in a production container.

This plan covers a single-host deployment. It does not provide high availability, horizontal scaling, certificate automation, a new public API origin, or a production Expo/Metro service. Use HTTPS for any production mobile API origin configured in a separate mobile release process; Expo Go remains a development workflow.

## Images and configuration

The API image restores and publishes with SDK `10.0.114`, then runs on ASP.NET runtime `10.0.14`; the `production` stage is the default final target. A separate `migration` stage contains a framework-dependent EF migration bundle. The production API sets `SetApplicationName("Aqours")` and persists keys under `AQOURS_DATA_PROTECTION_KEY_PATH=/var/lib/aqours/data-protection`, backed by the separate `production-data-protection` volume. The web image builds with Node `22.22.2-bookworm-slim` and pnpm `11.24.0`, then serves static assets from nonroot `nginx:1.30.6-alpine3.24`. The production images must not include source bind mounts, the SDK in the API runtime, `dotnet watch`, personal user-secrets files, or development-only settings.

The Compose file and `.env.production.example` use `PROD_PUBLIC_HOST`, `PROD_WEB_PORT`, `PROD_API_IMAGE`, `PROD_WEB_IMAGE`, `PROD_MIGRATION_IMAGE`, `PROD_PROXY_CIDR`, `PROD_DATABASE_CIDR`, `PROD_POSTGRES_DB/USER/PASSWORD`, `PROD_API_CONNECTION_STRING`, `PROD_MIGRATION_CONNECTION_STRING`, `PROD_JWT_ISSUER/AUDIENCE/SIGNING_KEY`, `PROD_SEED_ADMIN_EMAIL/FIRST_NAME/MIDDLE_NAME/LAST_NAME/PASSWORD`, and `PROD_VITE_GEOAPIFY_API_KEY`. Image variables default to local tags and may be set to immutable registry references. `PROD_VITE_GEOAPIFY_API_KEY` is a public value passed only as a web build argument. Compose maps the API connection string, JWT, and seed variables into the existing ASP.NET Core keys (`ConnectionStrings__Aqours`, `Jwt__*`, and `SeedAdmin__*`); the API validates those mapped values at startup. `PROD_PUBLIC_HOST` and `PROD_PROXY_CIDR` are passed to the production hosting helper. Compose maps `PROD_API_CONNECTION_STRING` into the API's `ConnectionStrings__Aqours` setting, and maps only `PROD_MIGRATION_CONNECTION_STRING` into the profile-gated `migrate` service's setting with the same key. The `PROD_POSTGRES_*` values initialize the database bootstrap user for a new volume and are not the API's least-privilege credentials; changing them does not update roles in an already-initialized volume.

Use the production environment example and explicit Compose `--env-file` and `-f compose.production.yaml` options so Compose does not fall back to the development root `.env`. Keep runtime application credentials separate from one-shot schema migration credentials. Provision the application role with the table CRUD and sequence privileges required by the application and startup seeder; set default privileges for the migration role so future tables and sequences grant the app role its needed access. Provision the migration role with DDL ownership/privileges for the schema and `SELECT` access to `__EFMigrationsHistory`. The API receives only the application connection string; the migration bundle receives only the migration connection string. Inject secrets through the restricted production environment mechanism; do not bake secrets into image layers or build arguments. Keep the JWT signing key stable across restarts. Compose mounts the `production-data-protection` volume at `/var/lib/aqours/data-protection` and sets `AQOURS_DATA_PROTECTION_KEY_PATH` to that path; the API persists keys with application name `Aqours`.

## Release sequence

Run these commands from the repository root. Compose config parsing was checked with dummy values; the release commands below have not been used against a live database or production deployment. Keep the populated production file access-controlled. The repository ignores `.env.production`, but keep the file private and do not commit it. Do not edit or use the developer's root `.env` for this stack.

```sh
export PROD_ENV_FILE="$PWD/.env.production"
if [ ! -f "$PROD_ENV_FILE" ]; then install -m 600 .env.production.example "$PROD_ENV_FILE"; fi
chmod 600 "$PROD_ENV_FILE"
```

Edit that private file with deployment-owner values and keep its permissions restricted (for example, mode `0600`). Replace the sample host, set all required values, use unique immutable release image tags instead of `:local`, and choose non-overlapping network CIDRs. `PROD_PUBLIC_HOST` must be a hostname or IPv4 address without a scheme, port, path, or wildcard; the API validates it and sets it as its exact allowed host. The seed email is required on every API start. Seed names and password are needed only when creating the initial administrator. The JWT signing key must contain at least 32 UTF-8 bytes and remain stable. The public Geoapify key is embedded in the static client bundle; it is not a server secret. See [authentication settings](authentication.md#production-compose-settings) for connection-string quoting.

Keep `PROD_ENV_FILE` set in the shell where you run the following commands.

Validate Compose interpolation without printing the resolved configuration or secret values. This checks Compose parsing; the API validates its runtime settings during startup:

```sh
docker compose --env-file "$PROD_ENV_FILE" -f compose.production.yaml config --quiet
```

Build the release images before the maintenance window, or publish immutable tags from CI and pull them on the host. Keep the previous release images available until the new release is accepted. The example `:local` tags are for local builds; set `PROD_API_IMAGE`, `PROD_WEB_IMAGE`, and `PROD_MIGRATION_IMAGE` to unique release tags for deployment.

```sh
# Build on the release host from the checked-out source:
docker compose --env-file "$PROD_ENV_FILE" -f compose.production.yaml --profile migration build api web migrate

# Or pull immutable API/web/migration tags published by CI:
docker compose --env-file "$PROD_ENV_FILE" -f compose.production.yaml --profile migration pull api web migrate
```

For an initial deployment, start the production database and provision the separate roles before migrating. For an upgrade on this single-host setup, schedule a maintenance window and stop application traffic before backing up and applying schema changes. Keep PostgreSQL running while the web and API are stopped; this prevents new writes after the backup and avoids an old API process writing against a changed schema.

```sh
docker compose --env-file "$PROD_ENV_FILE" -f compose.production.yaml up -d --wait db
# For upgrades only; leave PostgreSQL running.
docker compose --env-file "$PROD_ENV_FILE" -f compose.production.yaml stop web api
```

Use the PostgreSQL bootstrap role from the `db` container to provision the production roles. This keeps `${POSTGRES_USER}` and `${POSTGRES_DB}` expansion inside the container; `--env-file` values are used by Compose and are not automatically exported into the host shell:

```sh
docker compose --env-file "$PROD_ENV_FILE" -f compose.production.yaml exec db sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

At the interactive `psql` prompt, create separate login roles without elevated cluster privileges. The default database is `aqours` and the bootstrap login is `aqours_bootstrap`; the command above reads the configured `POSTGRES_USER` and `POSTGRES_DB` inside the container. If `PROD_POSTGRES_DB` is changed, substitute that database name in the `GRANT CONNECT` statement and in both connection strings. `\password` prompts for each password without putting it in SQL or shell history:

```sql
CREATE ROLE aqours_app LOGIN;
CREATE ROLE aqours_migrator LOGIN;
\password aqours_app
\password aqours_migrator
GRANT CONNECT ON DATABASE aqours TO aqours_app, aqours_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO aqours_migrator;
ALTER DEFAULT PRIVILEGES FOR ROLE aqours_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aqours_app;
ALTER DEFAULT PRIVILEGES FOR ROLE aqours_migrator IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO aqours_app;
```

Set `PROD_API_CONNECTION_STRING` to use database `aqours` and login `aqours_app`; set `PROD_MIGRATION_CONNECTION_STRING` to use the same database and login `aqours_migrator`. Store their passwords only in the private env file with valid Compose/Npgsql quoting. Do not use the bootstrap account as the API runtime identity. The migration bundle runs as `aqours_migrator`, so it owns the schema objects it creates. The default-privilege rules grant `aqours_app` access to future objects. Compose does not create these roles or grants.

Back up the database to a protected destination outside the repository before a migration. Choose a unique destination path so an earlier backup is not overwritten:

```sh
PROD_BACKUP_FILE=/secure/backups/aqours-production-before-release.sql
if [ -e "$PROD_BACKUP_FILE" ]; then echo "Choose a new backup path; refusing to overwrite an existing file." >&2; exit 1; fi
docker compose --env-file "$PROD_ENV_FILE" -f compose.production.yaml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$PROD_BACKUP_FILE" && test -s "$PROD_BACKUP_FILE"
```

Confirm the `pg_dump` command succeeds and the backup file is nonempty before continuing; do not migrate from a partial dump.

Run the EF migration bundle as a separate, one-shot service. It has access only to the migration connection string; the normal API startup verifies schema state and seeds accounts but never applies migrations.

```sh
docker compose --env-file "$PROD_ENV_FILE" -f compose.production.yaml --profile migration run --rm migrate
```

After a successful migration bundle, reconnect as the bootstrap role and grant the API role access to the current schema objects. This includes `SELECT` on `__EFMigrationsHistory`, which the API reads at startup to check for pending migrations:

```sql
GRANT USAGE ON SCHEMA public TO aqours_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aqours_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO aqours_app;
```

After the bundle succeeds, start the API and web using the already-built or pulled release images, then wait for their health checks:

```sh
docker compose --env-file "$PROD_ENV_FILE" -f compose.production.yaml up -d --no-build --wait api web
docker compose --env-file "$PROD_ENV_FILE" -f compose.production.yaml ps --all
```

The API health probe requests `http://127.0.0.1:8080/health` with `API_HEALTH_HOST` and a three-second timeout; `/health` reports process health and does not independently check database readiness. The web probe requests `/healthz` with the configured host and checks Nginx only. Confirm the external HTTPS edge serves the public hostname, browser sign-in/CSRF cookies work, and SignalR WebSockets pass through `/api` before ending the maintenance window.

## Operations and rollback

Use the Compose service names for status, logs, health checks, and controlled restarts. Services use `unless-stopped` restart policies, graceful stop periods (60 seconds for PostgreSQL, 30 seconds for the API, and 15 seconds for Nginx), read-only root filesystems, dropped Linux capabilities, and `no-new-privileges`. JSON container logs are rotated at 10 MiB with three files; arrange separate log retention/monitoring for the host. Preserve the production database volume and Data Protection key storage across container recreation. Inspect the project volumes with `docker volume inspect aqours-production_production-database aqours-production_production-data-protection`. Include the Data Protection key volume in protected host backups as well as the database; a SQL dump does not contain those keys. Do not reset the production Compose project with volume deletion. Limit database and API access to the internal service network; only the loopback web endpoint is intended for the existing edge proxy.

Rollback may restore a prior application image when the database schema remains compatible. It must not assume that reverting an image reverses a database migration. If a migration is not compatible with the previous application version, follow the reviewed restore procedure using the pre-migration backup and retained Data Protection keys; restore into the production database only after validating the procedure. Never point a production restore at the development database.
