# Aqours

Water reporting and supplier response MVP. This repository currently contains the application foundation; product workflows and mobile are still to be implemented.

## Prerequisites

- .NET SDK 10.0.108 (or a newer patch in the 10.0.1xx feature band; see `global.json`).
- Node.js 22.22.2 or newer and pnpm 11.24.0.
- Docker with Compose and the local image `postgres:18.6-alpine3.23`.

## Local setup

Run commands from the repository root:

```sh
pnpm install --frozen-lockfile
dotnet restore Aqours.slnx
cp .env.example .env
```

Skip the copy if `.env` already exists. Set your own `POSTGRES_PASSWORD` in `.env` before starting PostgreSQL. Initial setup on the original development device created an ignored `.env` with a random local password.

```sh
pnpm dev
```

This starts PostgreSQL and waits for it to be healthy, then runs the API and web app together through `concurrently`, with labeled logs. Press Ctrl+C to stop both application processes; PostgreSQL remains running until `pnpm db:down`. If either application exits, the other is stopped too.

For separate terminals, use `pnpm db:up`, `pnpm dev:api`, and `pnpm dev:web`.

- Web: `http://localhost:5173` (use the URL Vite prints if that port is occupied).
- API process health: `http://localhost:5251/health`.
- PostgreSQL: `localhost:5433`, database/user `aqours`, password from `.env`.

The database uses a separate `aqours-hackathon` Compose project and volume to avoid the existing `aqours` database on port 5432. The image is reused locally without pulling. On another device, run `docker pull postgres:18.6-alpine3.23` once before `pnpm db:up`. Override `POSTGRES_PORT` in `.env` if necessary.

The API registers an EF Core PostgreSQL context in Infrastructure with Identity persistence support and snake_case naming through `EFCore.NamingConventions`. Its health endpoint only checks that the API is running. Migrations, account services/endpoints, product features, web routing/query/maps, and mobile setup are subsequent work. No privileged credentials belong in client configuration.

## API database configuration

Supply the connection string through ASP.NET Core configuration before using the database context:

```sh
export ConnectionStrings__Aqours='Host=localhost;Port=5433;Database=aqours;Username=aqours;Password=<local password>'
```

Replace the placeholder with your local password; keep credentials out of tracked files. Docker Compose's `.env` is not automatically loaded by ASP.NET Core. The connection string is validated when the context is resolved, so the process-only `/health` endpoint can run without database configuration.

`AqoursDbContext` derives from `IdentityDbContext`; tables, columns, keys, and indexes use snake_case (for example, `asp_net_users` and `user_name`). The context explicitly maps Identity's table and index names because Identity overrides those conventions. The API references `Microsoft.EntityFrameworkCore.Design` for migration tooling; target Infrastructure as the migrations project and Api as the startup project when using `dotnet ef`. No migrations are included, and startup does not create or modify the database.

## Web styling

Tailwind CSS is configured with the official `@tailwindcss/vite` plugin in `apps/web/vite.config.ts` and imported in `apps/web/src/index.css`. Use Tailwind utility classes in React components. The generated starter styles remain until product screens are built.

## Verification

```sh
pnpm build:api
pnpm build:web
pnpm lint:web
docker compose config --quiet
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT version();"'
```

Stop the database with `pnpm db:down`; its named volume persists. PostgreSQL initialization settings apply only to a new volume.

## Layout and architecture

- `apps/api/src/Aqours.Domain`: domain layer.
- `apps/api/src/Aqours.Application`: use cases and interfaces; references Domain.
- `apps/api/src/Aqours.Infrastructure`: persistence and integrations; references Application and Domain.
- `apps/api/src/Aqours.Api`: Minimal API host; references Application and Infrastructure.
- `apps/web`: generated React + TypeScript + Vite starter with ESLint and Tailwind CSS.
- `packages/psgc`: canonical shared Philippine location data.

Read [architecture](docs/architecture.md), [product context](docs/context.md), and [progress](docs/PROGRESS.md) before implementation. The mobile app will be created separately.
