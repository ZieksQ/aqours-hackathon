# Authentication setup

The API requires PostgreSQL, JWT settings, and `SeedAdmin:Email` at startup. When that administrator does not exist yet, also configure the initial administrator's first name, last name, and password (middle name is optional). The API does not create the schema automatically. Apply EF Core migrations explicitly, then start the API; startup verifies there are no pending migrations and seeds the three roles plus the configured first administrator. See [the authentication feature spec](features/authentication/spec.md) for endpoint and session behavior.

## 1. Configure Docker Compose settings

The Docker-first workflow reads the root `.env` for Compose interpolation, then explicitly passes selected values into the API container as ASP.NET Core configuration. The root `.env` is not mounted into the container, and a developer's .NET user-secrets directory is not mounted either. Copy the template only if root `.env` does not already exist, and keep the database password in the API connection string synchronized with the PostgreSQL settings:

| Root `.env` variable | API configuration key |
| --- | --- |
| `DOCKER_API_CONNECTION_STRING` | `ConnectionStrings__Aqours` |
| `JWT_ISSUER` | `Jwt__Issuer` |
| `JWT_AUDIENCE` | `Jwt__Audience` |
| `JWT_SIGNING_KEY` | `Jwt__SigningKey` |
| `SEED_ADMIN_EMAIL` | `SeedAdmin__Email` |
| `SEED_ADMIN_FIRST_NAME` | `SeedAdmin__FirstName` |
| `SEED_ADMIN_MIDDLE_NAME` | `SeedAdmin__MiddleName` |
| `SEED_ADMIN_LAST_NAME` | `SeedAdmin__LastName` |
| `SEED_ADMIN_PASSWORD` | `SeedAdmin__Password` |

`DOCKER_API_CONNECTION_STRING` must use `Host=db;Port=5432` and match `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`. The sample issuer and audience are local defaults; provide a unique `JWT_SIGNING_KEY` of at least 32 UTF-8 bytes and keep it stable across API restarts. Changing the key invalidates outstanding JWT access tokens. `SEED_ADMIN_EMAIL` is required whenever the API starts. The name and password values are needed only to create the initial administrator; middle name is optional. Keep JWT and seed credentials private. Optional map and Expo variables are public client configuration, not a place for API secrets.

The Compose `.env` parser interpolates unquoted and double-quoted values; single-quoted values are literal. If a connection-string password contains `$`, single-quote the whole `DOCKER_API_CONNECTION_STRING` value in root `.env`. Npgsql uses semicolons to separate connection-string fields, so double-quote a field value that itself contains a semicolon, for example `Password="part;one"`. See [Docker Compose environment-file syntax](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/) and [Npgsql connection-string parameters](https://www.npgsql.org/doc/connection-string-parameters.html).

CI can set the same Compose variables in its job environment without creating a root `.env` file. For the API when run directly on the host, use .NET user secrets or host environment variables instead; Compose's `.env` values are not automatically loaded by ASP.NET Core. See [local API user secrets](user-secrets.md) for host setup commands.

### Production Compose settings

The production Compose file uses a separate `PROD_` environment contract. Invoke it with the explicitly selected production env file so Compose does not fall back to the development root `.env`. The mapping below matches the current Compose source; the API build and hosting tests passed, but production container/runtime behavior has not been verified. See the [production deployment runbook](deployment.md) for the release boundary and migration workflow.

| Production variable | Purpose |
| --- | --- |
| `PROD_API_CONNECTION_STRING` | API runtime connection string for a restricted application database role. |
| `PROD_MIGRATION_CONNECTION_STRING` | One-shot migration bundle connection string for a separate role with required DDL privileges. |
| `PROD_POSTGRES_DB`, `PROD_POSTGRES_USER`, `PROD_POSTGRES_PASSWORD` | PostgreSQL bootstrap values for initializing the production database volume; do not use this bootstrap account as the API runtime account. |
| `PROD_JWT_ISSUER`, `PROD_JWT_AUDIENCE`, `PROD_JWT_SIGNING_KEY` | Server-side JWT configuration; keep the signing key stable across restarts. |
| `PROD_SEED_ADMIN_EMAIL`, `PROD_SEED_ADMIN_FIRST_NAME`, `PROD_SEED_ADMIN_MIDDLE_NAME`, `PROD_SEED_ADMIN_LAST_NAME`, `PROD_SEED_ADMIN_PASSWORD` | Server-side initial administrator settings. |
| `PROD_PUBLIC_HOST`, `PROD_PROXY_CIDR`, `PROD_DATABASE_CIDR`, `PROD_WEB_PORT` | Public host name, trusted proxy subnet, private database subnet, and loopback web port. |
| `PROD_VITE_GEOAPIFY_API_KEY` | Public browser map key passed to the web image build; never place server credentials here. |

Provide production values through the restricted production environment mechanism with explicit `--env-file` and `-f compose.production.yaml` options. The API runtime and migration bundle must receive only their respective connection strings. The `PROD_POSTGRES_*` values initialize a new PostgreSQL volume; changing them does not rotate credentials in an existing database. Compose dotenv parsing also applies to the production connection strings: if a password contains `$`, single-quote the entire connection-string value; if it contains a semicolon, quote that password field using Npgsql connection-string syntax. See the Docker Compose and Npgsql references above.

## 2. Apply database migrations

The EF migrations are committed under `apps/api/src/Aqours.Infrastructure/Persistence/Migrations`. With Docker Compose, start PostgreSQL and apply the migrations explicitly before starting the API and web app:

```sh
docker compose up -d --wait db
docker compose run --rm --build api dotnet ef database update --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api
```

The API image restores the repository-pinned EF tool from `dotnet-tools.json`. For the host workflow, restore the tool and apply the same migrations with:

```sh
dotnet tool restore
dotnet ef database update --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api
```

The design-time context factory reads API user secrets and environment variables without running the normal startup seeder. For future model changes, add migrations to the same Infrastructure folder, then review and commit them with the feature. In Docker Compose, use the API container so the repository-pinned EF tool and SDK are available:

```sh
docker compose run --rm --build api dotnet ef migrations add <MigrationName> --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api --output-dir Persistence/Migrations
```

For the host workflow, use:

```sh
dotnet ef migrations add <MigrationName> --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api --output-dir Persistence/Migrations
```

Apply each migration with `dotnet ef database update`. API startup never runs `Migrate`, `EnsureCreated`, or schema-changing SQL. The seeder refuses to start if EF reports pending migrations.

## 3. Start the applications

Once configuration and schema are ready, the Docker workflow starts the API and web app with `docker compose up --build`. The host workflow starts both with `pnpm dev`, or starts the API alone with `pnpm dev:api`. API startup creates any missing `Admin`, `Staff`, and `Customer` roles and creates the configured administrator only if that email does not already exist. If it exists, the account must already have exactly the `Admin` role; the seeder never promotes the account or resets its password. It fails rather than silently changing a conflicting account. Keep `SeedAdmin:Email` configured on every start; name and password values are only needed to create the initial account.

The web portal is at `http://localhost:5173`, the API is at `http://localhost:5251`, and `/health` reports API process health. `/health` does not establish that the database is healthy; the API itself requires database access and valid settings during startup.

## Web/API routing

The browser calls the relative `/api` path. In the Docker development workflow, Vite proxies it to the API service through server-only `API_PROXY_TARGET=http://api:5251`; in host development, Vite proxies it to `http://localhost:5251`. Both preserve same-origin requests for session and antiforgery cookies. In production Compose, Nginx proxies `/api` and SignalR WebSocket traffic through the same origin and serves the SPA for client-side routes. Production authentication cookies use the HTTPS-only secure policy; the TLS edge must preserve the public host, and Nginx sets `X-Forwarded-Host` and `X-Forwarded-Proto=https` for the API. The API accepts those headers only from its configured proxy subnet. Keep browser authentication same-origin; cookie and CSRF behavior depends on that routing. Staff report workspace mutations also use the web session and must include the antiforgery request token; see the [workspace spec](features/staff-report-workspace/spec.md) for REST and SignalR access rules. See the [production runbook](deployment.md) for proxy and secret configuration; the development Compose setup remains a separate workflow.

## Account directory

`GET /api/accounts` returns the existing public account DTOs (identity, role, and initial-password-change state) for an unrestricted Admin web session. Anonymous sessions, Staff, Customers, and Admins who have not changed their initial password cannot list accounts; passwords, security stamps, and Identity persistence fields are never returned. The one-organization MVP directory applies name/email, role, password-setup filters and ten-row pagination in the web client.

## Integration test database

The API integration suite uses a real PostgreSQL database and migrates it. Create a separate disposable database named `aqours_auth_integration_tests`, then set `AQOURS_TEST_CONNECTION_STRING` to its connection string before running `dotnet test Aqours.slnx`. The test fixture checks the database name before changing its schema. Never point it at a development or production database.

The realtime SignalR integration test also starts the API with Kestrel on an ephemeral loopback port and launches the official JavaScript client from `apps/web/scripts/verify-reports-realtime.mjs`. Install workspace dependencies first with `pnpm install --frozen-lockfile`; Node.js 22.22.2 or newer is required, and the environment must allow binding and connecting to loopback ports.
