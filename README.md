# Aqours

Water reporting and supplier response MVP. Account authentication, the Customer reporting API (submission, customer-owned listing, detail retrieval, and messaging), the Staff report queue and ticket workspace, Admin supplier-site management, Admin/Staff manual supply monitoring and the supplier portal map in the web portal and API, personnel weather monitoring in the web portal and API, and mobile Customer login, Home, report submission with location selection, owned-report history, and supplier conversations are implemented. Customer supplier-site maps, supply display, and weather UI, push notifications, and server-persisted notification read state remain deferred. Mobile Updates and Profile now use the existing Customer APIs; see the mobile README for their limits.

## Prerequisites

The recommended local workflow targets native Linux with Docker Engine and the Compose plugin; it does not require a host .NET SDK, Node.js, or pnpm installation.

The optional host workflow requires .NET SDK 10.0.108 (or a newer patch in the 10.0.1xx feature band; see `global.json`), Node.js 22.22.2 or newer, and pnpm 11.24.0. Both workflows use PostgreSQL 18.6 from `postgres:18.6-alpine3.23`.

## Local development with Docker Compose

Run commands from the repository root. On first setup, copy the Docker configuration template only when you do not already have a root `.env`:

```sh
if [ ! -f .env ]; then cp .env.example .env; fi
```

Keep an existing `.env` and its database password; do not overwrite it with the template. Configure `POSTGRES_PASSWORD`, `DOCKER_API_CONNECTION_STRING`, `JWT_SIGNING_KEY`, and the initial administrator values in the root `.env`. The API connection string must use `Host=db;Port=5432` and match `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`. Use a unique signing key with at least 32 UTF-8 bytes. `SEED_ADMIN_EMAIL` is required whenever the API starts; the administrator name and password are needed only when creating that account. The signing key and administrator password are server credentials. For Docker, copy any public `VITE_GEOAPIFY_API_KEY`, `EXPO_PUBLIC_GEOAPIFY_API_KEY`, or `EXPO_PUBLIC_EAS_PROJECT_ID` values you use from per-app environment files into the root `.env`; Compose does not mount those files, and the build context excludes them. Keep the per-app files for host development and never put privileged credentials in public client settings. See [mobile setup](apps/mobile/README.md) and [authentication setup](docs/authentication.md) for details.

The root `.env` is Compose configuration. Compose passes explicitly selected settings into the API; it does not mount your personal .NET user-secrets store. In CI, provide the required Compose variables through the job environment instead of creating an env file. `LOCAL_UID` and `LOCAL_GID` default to `1000`; set them to your host user and group IDs if mounted files have the wrong ownership. `VITE_USE_POLLING` defaults to `false`; set it to `true` only if Vite does not detect changes through the source mounts.

Start PostgreSQL, apply the committed EF migrations, then start the API and web app:

```sh
docker compose up -d --wait db
docker compose run --rm --build api dotnet ef database update --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api
docker compose up --build
```

The migration command applies schema changes explicitly; API startup does not apply migrations. Repeat it after adding migrations. See the [Customer reporting API spec](docs/features/customer-reporting/specs.md), [Staff report workspace spec](docs/features/staff-report-workspace/spec.md), [Supply Site Management spec](docs/features/supply-site-management/spec.md), [Manual Supply Monitoring API spec](docs/features/manual-supply-monitoring/spec.md), and [Weather Warnings API spec](docs/features/weather-warnings/spec.md) for feature contracts and migration history.

The Compose project is named `aqours-hackathon` and preserves its `database` volume. PostgreSQL publishes on `127.0.0.1:5433`; the web app is at `http://localhost:5173`, and the API process health endpoint is at `http://localhost:5251/health`. `/health` reports process health, not database readiness. The web app proxies `/api` to the API service so browser cookies, antiforgery checks, and SignalR use the web origin. Press Ctrl+C to stop the foreground services; `docker compose down` also stops them and retains the database volume. Do not use `docker compose down --volumes` if you need the existing database data. To inspect the volume metadata, run `docker volume inspect aqours-hackathon_database`. To back up the database, choose a destination outside the repository and run `docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > /path/to/aqours.sql`.

PostgreSQL uses `postgres:18.6-alpine3.23` with `pull_policy: missing`: Compose can pull the image on a new device and reuse it locally afterward. The database remains separate from the existing `aqours` Compose project and its port 5432. The API Data Protection key ring is persisted separately in the `api-data-protection` volume; the API NuGet package cache uses the `nuget-cache` volume.

The API uses ASP.NET Core Identity with PostgreSQL persistence and snake_case naming through `EFCore.NamingConventions`. Supplier users authenticate with a protected HTTP-only cookie; the mobile API issues short-lived Customer JWTs and rotates hashed refresh tokens. See the [authentication feature spec](docs/features/authentication/spec.md) for contracts, roles, CSRF, and session behavior. No privileged credentials belong in client configuration.

## Host development alternative

Use this workflow when you want to run the API and web app directly on the host. Install the prerequisites above, then run from the repository root:

```sh
pnpm install --frozen-lockfile
dotnet restore Aqours.slnx
dotnet tool restore
```

Configure the API connection string, JWT settings, and seed administrator through .NET user secrets or environment variables as described in [authentication setup](docs/authentication.md). Docker Compose's `.env` is not automatically loaded into a host-run ASP.NET Core process.

Before the first API start, apply all committed migrations after configuring the connection string:

```sh
pnpm db:up
dotnet tool restore
dotnet ef database update --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api
```

`pnpm dev` starts PostgreSQL and waits for it to be healthy, then runs the API and web app together through `concurrently`, with labeled logs. Press Ctrl+C to stop both application processes; PostgreSQL remains running until `pnpm db:down`. If either application exits, the other is stopped too. For separate terminals, use `pnpm db:up`, `pnpm dev:api`, and `pnpm dev:web`.

For the host workflow, PostgreSQL is available at `localhost:5433`, database/user `aqours`, with the password from `.env`. Override `POSTGRES_PORT` in the root `.env` if necessary. Keep host API credentials in user secrets or environment variables; see [local API user secrets](docs/user-secrets.md).

`AqoursDbContext` derives from `IdentityDbContext` and stores refresh families and hashed refresh tokens. Tables, columns, keys, and indexes use snake_case (for example, `asp_net_users` and `normalized_email`). EF migrations live in Infrastructure; target Infrastructure and use Api as the startup project when running `dotnet ef`. Apply each migration explicitly before starting the API; startup does not create or modify the database schema.

## Web styling

Tailwind CSS is configured with the official `@tailwindcss/vite` plugin in `apps/web/vite.config.ts` and imported in `apps/web/src/index.css`. The web app includes supplier sign-in, an Admin account directory and creation form, password change, report dashboards with seven-day submission charts and workload summaries, and the Staff report queue and ticket workspace. Shared browser UI is implemented in `packages/ui`; use its public components across portal pages instead of duplicating common navigation and layout markup. Use the Feather set from `react-icons/fi`; preserve the existing custom Aqours brand mark. Admins can list, add, view, and edit supply sites at `/supply-sites`, including canonical Philippine addresses and independent map pins. Admin and Staff can review paginated manual supply readings at `/supply-monitoring`; Staff can record readings, while Admin has read-only access. Both roles can use `/map` to browse supply sites and authorized report locations, filter layers, status, and priority, and open tickets or supply history; see the [Supplier Portal Map spec](docs/features/supplier-portal-map/spec.md). Admin and Staff can use `/weather-monitoring` for three-day forecasts, a site map, supply-risk counts, and individual assessments; Admin can configure the demo threshold at `/weather-monitoring/settings`. Forecasts and warning decisions come from the existing Weather Warnings API. See the [Weather Warnings API spec](docs/features/weather-warnings/spec.md). Mobile Customer login, Home, report submission with map/GPS selection, owned-report history, and conversations are implemented; Customer supplier-site maps, supply display, and weather UI, push notifications, and server-persisted notification read state remain deferred. Mobile Updates and Profile use the existing Customer APIs with the limits documented in the mobile README.

To review supply monitoring in a real browser, run `pnpm dev:web`, then in another terminal set `CDP_HELPER` to a local zero-dependency Chrome DevTools Protocol helper module and `CHROME_PATH` to Chrome/Chromium, and run:

```sh
WEB_BASE_URL=http://127.0.0.1:5173 node apps/web/scripts/verify-supply-monitoring-browser.mjs
```

The script uses fixture data and does not require a live API; set `CAPTURE_DIR` to save screenshots.

For host web development, copy `apps/web/.env.example` to `apps/web/.env.local` only if that file does not already exist, then set `VITE_GEOAPIFY_API_KEY` for supply-site maps and the supplier portal map. Preserve any existing per-app environment files. This browser-visible key should be restricted to your application origins. Restart Vite after changing it; builds use the configured value at build time. Map loading failures have a retry action, and an unconfigured map shows a setup notice. The address selectors do not move or verify the map pin. The portal map keeps its location list usable when tiles are unavailable, and its site/report layer reads use the existing personnel cookie policy. No additional migration is required for the portal map.

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

For an opt-in Docker-based Expo Go session, set `LAN_IP` in the root `.env` to the development computer's Wi-Fi/LAN IPv4 address and set `API_BIND_ADDRESS=0.0.0.0`. Then run:

```sh
docker compose --profile mobile up --build
```

This starts the normal database/API/web services plus the Expo Go packager on port 8081. The phone must be able to reach the computer on ports 5251 and 8081; allow those ports through the local firewall. The API URL is derived from `LAN_IP` and does not include `/api`. Use the opt-in profile only when testing on a real phone; see the [mobile README](apps/mobile/README.md) for map-key settings and the host alternative.

```sh
pnpm dev:mobile
```

Install Expo Go on your real Android or iOS phone, connect the phone and development computer to the same Wi-Fi network, and scan the terminal QR code (Expo Go on Android or Camera on iOS). Allow local network access and development-server traffic through the computer firewall. The command explicitly uses Expo Go over LAN. SDK 57 is selected for physical-device Expo Go compatibility per the [Expo project setup guidance](https://docs.expo.dev/get-started/create-a-project/).

Use only a real phone connected to Expo Go for mobile runtime testing. Do not generate APKs, native builds, or test through emulators/simulators. `pnpm typecheck:mobile` checks TypeScript but does not replace phone verification. Physical-phone verification of the native screens and location interactions remains pending.

If `apps/mobile/.env.local` does not already exist, copy `apps/mobile/.env.example` to it, then set `EXPO_PUBLIC_API_URL` to the computer's LAN origin (for example, `http://192.168.1.100:5251`, without `/api`). Expose the configured development API with `dotnet run --project apps/api/src/Aqours.Api --launch-profile http --urls http://0.0.0.0:5251`. Sign in with a supplier-created Customer account; the app handles the required initial password change and keeps tokens in memory. The development-only **Preview Home design** button shows labeled Stitch sample data without signing in. Keep privileged credentials on the API; see [the mobile README](apps/mobile/README.md) for details and verification commands.
