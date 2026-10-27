# Aqours

Water reporting and supplier response MVP. Account authentication, the Customer reporting API (submission, customer-owned listing, detail retrieval, and messaging), the Staff report queue and ticket workspace, Admin supplier-site management in the web portal and API, and mobile Customer login, Home, report submission with location selection, owned-report history, and supplier conversations are implemented. Customer supplier-site maps, supply, weather, the Updates inbox, and full Profile remain deferred.

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

Before the first API start, restore the pinned EF tool and apply all committed migrations after configuring the connection string (including `InitialAccounts`, `CustomerReports`, `StaffReportWorkspace`, and `SupplySiteManagement`):

```sh
pnpm db:up
dotnet tool restore
dotnet ef database update --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api
```

Startup checks for pending migrations and seeds the supported roles and configured first administrator. It does not apply migrations automatically. See the [Customer reporting API spec](docs/features/customer-reporting/specs.md), [Staff report workspace spec](docs/features/staff-report-workspace/spec.md), and [Supply Site Management spec](docs/features/supply-site-management/spec.md) for their contracts and migration details.

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

Tailwind CSS is configured with the official `@tailwindcss/vite` plugin in `apps/web/vite.config.ts` and imported in `apps/web/src/index.css`. The web app includes supplier sign-in, an Admin account directory and creation form, password change, report dashboards with seven-day submission charts and workload summaries, and the Staff report queue and ticket workspace. Shared browser UI is implemented in `packages/ui`; use its public components across portal pages instead of duplicating common navigation and layout markup. Use the Feather set from `react-icons/fi`; preserve the existing custom Aqours brand mark. Admins can list, add, view, and edit supply sites at `/supply-sites`, including canonical Philippine addresses and independent map pins. Mobile Customer login, Home, report submission with map/GPS selection, owned-report history, and conversations are implemented; Customer supplier-site maps, supply, weather, an Updates inbox, and full Profile remain deferred.

Copy `apps/web/.env.example` to `apps/web/.env.local` and set `VITE_GEOAPIFY_API_KEY` for supply-site maps. This browser-visible key should be restricted to your application origins. Restart Vite after changing it; builds use the configured value at build time. Map loading failures have a retry action, and an unconfigured map shows a setup notice. The address selectors do not move or verify the map pin.

## Verification

`pnpm build:web` type-checks `@aqours/ui` before building the web app. `pnpm lint:web` lints the shared UI package and web app.

```sh
pnpm build:api
pnpm build:web
pnpm lint:web
dotnet test Aqours.slnx
docker compose config --quiet
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT version();"'
```

The API integration suite requires its own disposable PostgreSQL database. Configure `AQOURS_TEST_CONNECTION_STRING` as described in [authentication setup](docs/authentication.md) before running `dotnet test`.

Realtime integration verification starts the API on an ephemeral loopback port and runs the official SignalR JavaScript client through Node. Run `pnpm install --frozen-lockfile` first so `@microsoft/signalr` is available in the web workspace, and allow the test process to bind and connect to loopback. Node.js 22.22.2 or newer is required as listed above.

Stop the database with `pnpm db:down`; its named volume persists. PostgreSQL initialization settings apply only to a new volume.

## Layout and architecture

- `apps/api/src/Aqours.Domain`: domain layer.
- `apps/api/src/Aqours.Application`: use cases and interfaces; references Domain.
- `apps/api/src/Aqours.Infrastructure`: persistence and integrations; references Application and Domain.
- `apps/api/src/Aqours.Api`: Minimal API host; references Application and Infrastructure.
- `apps/web`: React + TypeScript + Vite app with ESLint, Tailwind CSS, routing, query state, and supplier account screens.
- `apps/mobile`: React Native + TypeScript Customer login, Home, reporting, history, and conversations for Expo Go on a real phone.
- `packages/ui`: reusable browser UI components shared across web features; see [the package README](packages/ui/README.md) for its public exports and usage.
- `packages/psgc`: canonical shared Philippine location data.

Read [architecture](docs/architecture.md), [product context](docs/context.md), [progress](docs/PROGRESS.md), and the [authentication spec](docs/features/authentication/spec.md) before implementation. See [mobile setup and design rules](apps/mobile/README.md) for the implemented mobile screens, reporting behavior, and deferred features.

## Mobile development (Expo Go)

```sh
pnpm dev:mobile
```

Install Expo Go on your real Android or iOS phone, connect the phone and development computer to the same Wi-Fi network, and scan the terminal QR code (Expo Go on Android or Camera on iOS). Allow local network access and development-server traffic through the computer firewall. The command explicitly uses Expo Go over LAN. SDK 57 is selected for physical-device Expo Go compatibility per the [Expo project setup guidance](https://docs.expo.dev/get-started/create-a-project/).

Use only a real phone connected to Expo Go for mobile runtime testing. Do not generate APKs, native builds, or test through emulators/simulators. `pnpm typecheck:mobile` checks TypeScript but does not replace phone verification. Physical-phone verification of the native screens and location interactions remains pending.

Copy `apps/mobile/.env.example` to `apps/mobile/.env.local`, set `EXPO_PUBLIC_API_URL` to the computer's LAN origin (for example, `http://192.168.1.100:5251`, without `/api`), and expose the configured development API with `dotnet run --project apps/api/src/Aqours.Api --launch-profile http --urls http://0.0.0.0:5251`. Sign in with a supplier-created Customer account; the app handles the required initial password change and keeps tokens in memory. The development-only **Preview Home design** button shows labeled Stitch sample data without signing in. Keep privileged credentials on the API; see [the mobile README](apps/mobile/README.md) for details and verification commands.
