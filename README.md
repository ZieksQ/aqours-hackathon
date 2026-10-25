# Aqours

Water reporting and supplier response MVP. Account authentication is implemented for the supplier web portal and customer API clients. Report, supply, weather, and mobile application workflows remain to be built.

## Prerequisites

- .NET SDK 10.0.108 (or a newer patch in the 10.0.1xx feature band; see `global.json`).
- Node.js 22.22.2 or newer and pnpm 11.24.0.
- Docker with Compose and the local image `postgres:18.6-alpine3.23`.

## Local setup

Run commands from the repository root:

```sh
pnpm install --frozen-lockfile
dotnet restore Aqours.slnx
dotnet tool restore
cp .env.example .env
```

Skip the copy if `.env` already exists. Set your own `POSTGRES_PASSWORD` in `.env` before starting PostgreSQL. Initial setup on the original development device created an ignored `.env` with a random local password. Configure the API's connection string, JWT key, and initial administrator through user secrets or environment variables as described in [authentication setup](docs/authentication.md).

Before the first API start, restore the pinned EF tool and apply the committed `InitialAccounts` migration after configuring the connection string:

```sh
pnpm db:up
dotnet tool restore
dotnet ef database update --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api
```

Startup checks for pending migrations and seeds the supported roles and configured first administrator. It does not apply migrations automatically.

```sh
pnpm dev
```

This starts PostgreSQL and waits for it to be healthy, then runs the API and web app together through `concurrently`, with labeled logs. Press Ctrl+C to stop both application processes; PostgreSQL remains running until `pnpm db:down`. If either application exits, the other is stopped too.

For separate terminals, use `pnpm db:up`, `pnpm dev:api`, and `pnpm dev:web`.

- Web: `http://localhost:5173` (use the URL Vite prints if that port is occupied).
- API process health: `http://localhost:5251/health`.
- PostgreSQL: `localhost:5433`, database/user `aqours`, password from `.env`.

The database uses a separate `aqours-hackathon` Compose project and volume to avoid the existing `aqours` database on port 5432. The image is reused locally without pulling. On another device, run `docker pull postgres:18.6-alpine3.23` once before `pnpm db:up`. Override `POSTGRES_PORT` in `.env` if necessary.

The API uses ASP.NET Core Identity with PostgreSQL persistence and snake_case naming through `EFCore.NamingConventions`. Supplier users authenticate with a protected HTTP-only cookie; the mobile API issues short-lived Customer JWTs and rotates hashed refresh tokens. Its `/health` endpoint reports process health only. See the [authentication feature spec](docs/features/authentication/spec.md) for contracts, roles, CSRF, and session behavior. No privileged credentials belong in client configuration.

## API database configuration

Supply the database connection string, JWT settings, and seed administrator through ASP.NET Core configuration before starting the API. The recommended local setup is .NET user secrets:

```sh
export ConnectionStrings__Aqours='Host=localhost;Port=5433;Database=aqours;Username=aqours;Password=<local password>'
```

This connection string can also be set with `dotnet user-secrets`; see [authentication setup](docs/authentication.md) for all required settings. Replace placeholders with local values and keep credentials out of tracked files. Docker Compose's `.env` is not automatically loaded by ASP.NET Core. API startup requires the database and authentication settings, including when requesting `/health`.

`AqoursDbContext` derives from `IdentityDbContext` and stores refresh families and hashed refresh tokens. Tables, columns, keys, and indexes use snake_case (for example, `asp_net_users` and `normalized_email`). EF migrations live in Infrastructure; target Infrastructure and use Api as the startup project when running `dotnet ef`. Apply each migration explicitly before starting the API; startup does not create or modify the database schema.

## Web styling

Tailwind CSS is configured with the official `@tailwindcss/vite` plugin in `apps/web/vite.config.ts` and imported in `apps/web/src/index.css`. The web app includes supplier sign-in, account creation, password change, and a dashboard shell; other product screens remain deferred.

## Verification

```sh
pnpm build:api
pnpm build:web
pnpm lint:web
dotnet test Aqours.slnx
docker compose config --quiet
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT version();"'
```

The API integration suite requires its own disposable PostgreSQL database. Configure `AQOURS_TEST_CONNECTION_STRING` as described in [authentication setup](docs/authentication.md) before running `dotnet test`.

Stop the database with `pnpm db:down`; its named volume persists. PostgreSQL initialization settings apply only to a new volume.

## Layout and architecture

- `apps/api/src/Aqours.Domain`: domain layer.
- `apps/api/src/Aqours.Application`: use cases and interfaces; references Domain.
- `apps/api/src/Aqours.Infrastructure`: persistence and integrations; references Application and Domain.
- `apps/api/src/Aqours.Api`: Minimal API host; references Application and Infrastructure.
- `apps/web`: React + TypeScript + Vite app with ESLint, Tailwind CSS, routing, query state, and supplier account screens.
- `packages/psgc`: canonical shared Philippine location data.

Read [architecture](docs/architecture.md), [product context](docs/context.md), [progress](docs/PROGRESS.md), and the [authentication spec](docs/features/authentication/spec.md) before implementation. The mobile app will be created separately.
