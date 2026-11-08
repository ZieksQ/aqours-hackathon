# Project architecture rules

This document defines the required architecture and technology choices for Aqours. Use `docs/context.md` for the product workflow and MVP scope. If its earlier candidate technology choices differ from this document, this document takes precedence for architecture and stack decisions.

## 1. Monorepo structure

Keep the API, web app, mobile app, and reusable packages in one repository:

```text
apps/
  api/
    src/
      Aqours.Domain/
      Aqours.Application/
      Aqours.Infrastructure/
      Aqours.Api/
    tests/
  web/
  mobile/
packages/
  ui/
  psgc/
docs/
```

This tree describes the intended structure; create application projects and packages when needed. Use pnpm to manage the JavaScript workspace and dependencies, and NuGet to manage .NET dependencies. Applications must not import another application's source code. Share reusable code or data through `packages/`.

## 2. Required technology stack

| Concern | Technology or rule |
| --- | --- |
| Workspace manager | pnpm |
| Local development runner | Docker Compose is the primary API/web workflow; root `pnpm dev` remains the host-runtime alternative |
| Web and mobile package manager | pnpm |
| .NET package manager | NuGet |
| Web application | React with TypeScript, Vite, and ESLint |
| Web styling | Tailwind CSS through the official `@tailwindcss/vite` plugin |
| Mobile application | React Native with Expo Go |
| Mobile development and verification | Connect Expo Go on a real physical phone; no APKs, native builds, emulators, or simulators |
| API | .NET 10 / C#, ASP.NET Core Minimal API |
| Database | PostgreSQL 18.6, local Docker image `postgres:18.6-alpine3.23` |
| Accounts and password handling | ASP.NET Core Identity |
| Web routing | React Router |
| Web maps | React Leaflet |
| Map tiles | Geoapify |
| Weather forecasting | Open-Meteo free forecast API |
| Client server-data fetching, caching, and refreshing | TanStack Query |

React Leaflet is for the web application. Mobile report location selection uses Leaflet inside the approved Expo-compatible `react-native-webview`, Geoapify tiles, and `expo-location` for optional, single foreground GPS reads. The WebView bridge accepts validated coordinate selections and map loading/error status; map pins and GPS replace manual coordinate entry. Obtain approval before adding other mobile mapping dependencies. Check mobile behavior on a real phone, including connectivity to the development API.

Use ASP.NET Core Identity for account and password management; do not implement custom password hashing or credential storage. Backend authorization remains mandatory regardless of client-side route or screen restrictions.

### Local Docker development

The supported Docker target is native Linux with Docker Engine and the Compose plugin. Docker Compose is the primary local workflow for the database, API, and web app; the mobile service is opt-in through the `mobile` profile. This stack is for development and is not a production deployment configuration. It uses the exact PostgreSQL image `postgres:18.6-alpine3.23` with `pull_policy: missing`, so Compose pulls it when it is not already available. The Compose project is named `aqours-hackathon` and keeps its own `database` volume, separate from the existing `aqours` Compose project and data.

The database publishes on `127.0.0.1:5433` by default; containers connect to `db:5432`. Port 5433 avoids the existing PostgreSQL container on host port 5432. Root `.env.example` lists the Compose settings. Copy it to root `.env` only if that file does not already exist; preserve any existing local database password. `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` must agree with `DOCKER_API_CONNECTION_STRING`, which uses `Host=db;Port=5432`. CI may provide the variables in its environment rather than using an env file. Compose passes API settings explicitly; it does not mount a developer's .NET user-secrets directory. Copy any public map or Expo settings used by host development from the per-app `.env.local` files into the corresponding root `.env` variables for Docker; Compose does not mount per-app env files and the Docker build context excludes them. Keep the per-app files for host workflows. See [authentication setup](authentication.md) and [local API user secrets](user-secrets.md) for the distinction between container environment settings and host user secrets.

PostgreSQL 18 data persists at `/var/lib/postgresql`, with the image's default version-specific data directory underneath it, as required by the [official image documentation](https://github.com/docker-library/docs/blob/master/postgres/README.md#pgdata). The health check uses `pg_isready`; `docker compose up -d --wait db` waits for readiness. `docker compose down` retains the named volume. Inspect its metadata with `docker volume inspect aqours-hackathon_database`; back up the database with `docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > /path/to/aqours.sql`. Do not use `docker compose down --volumes` when preserving data. Initialization environment variables apply when the volume is first created; editing them later does not change existing database roles or passwords.

The API image pins SDK `10.0.114`. The repository's `global.json` requests `10.0.108` and allows the latest patch in that feature band. The image restores the repository-pinned EF tool from `dotnet-tools.json` and runs `dotnet watch` with polling. It listens on `0.0.0.0:5251` in the container, while the host port is loopback-bound by default. Its `/health` endpoint is a process health check, not a PostgreSQL readiness check. The development Data Protection key ring is persisted in the `api-data-protection` volume; the NuGet package cache uses the `nuget-cache` volume. `LOCAL_UID` and `LOCAL_GID` default to `1000`; set them to the host user's IDs when needed for ownership of bind-mounted files.

The web and mobile image uses Node.js 22.22.2 and pnpm 11.24.0 with the frozen workspace lockfile. JavaScript dependencies are installed in the image; the pnpm package store uses a BuildKit cache mount. Vite listens on port 5173 with strict-port behavior and proxies relative `/api` requests to `http://api:5251` through server-only `API_PROXY_TARGET`. The browser therefore keeps cookies, antiforgery requests, and SignalR on the web origin. The web host port is loopback-bound. Selective source mounts support live reload without mounting root `.env` or masking installed dependencies. `VITE_USE_POLLING` defaults to `false`; set it to `true` only if Vite does not detect changes through the bind mounts. The development Geoapify key is public client configuration; do not put server credentials in Vite or Expo settings.

The Expo Go service is behind the Compose `mobile` profile and exposes Metro on port 8081. Set `LAN_IP` to the development computer's LAN IPv4 address and `API_BIND_ADDRESS` to `0.0.0.0` so a physical phone can reach both published ports. The service derives `EXPO_PUBLIC_API_URL` as `http://<LAN_IP>:5251` without `/api`, runs Expo Go over LAN, and checks that the API binding and packager proxy use the same address. This profile is for Expo Go on a real phone; do not create native builds or use emulators/simulators.

Apply migrations explicitly before starting the applications. API startup verifies schema state but does not apply migrations:

```sh
docker compose up -d --wait db
docker compose run --rm --build api dotnet ef database update --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api
docker compose up --build
```

API startup verifies schema state and seeds the supported roles plus the configured initial Admin, but does not modify the schema. The Domain layer owns the Account entity and role names; Infrastructure adapts them to Identity persistence. Migrations are in `Aqours.Infrastructure/Persistence/Migrations`; use Infrastructure as the migration project and Api as the startup project. For host API/web development, `pnpm dev` remains available after host dependencies, the database, and .NET user secrets or environment variables are configured; it uses root `concurrently` to run the API and web app. See the [README](../README.md) for the host setup.

### Production deployment

The production-only Compose file and API/web image targets are separate from the development stack. The `aqours-production` project has independent `production-database` and `production-data-protection` volumes, an internal database network, and a loopback-published web endpoint for an existing HTTPS edge proxy. It is intended for a single native Linux host, without certificate automation, horizontal scaling, or high availability. Compose model checks and API hosting tests passed; Docker image builds and production runtime/deployment were not verified because Docker daemon access was denied. See the [production deployment runbook](deployment.md) for staging validation and operator commands.

The API image builds with the pinned .NET SDK and runs on the ASP.NET runtime; the web image builds the static Vite app and serves it with nonroot Nginx. Nginx routes same-origin `/api` and SignalR WebSocket traffic through the web service and sets the forwarded host and HTTPS scheme. The API trusts only the configured proxy subnet, allows the configured public host, and applies forwarded headers before HTTPS redirection. Supply credentials through restricted runtime configuration, apply schema migrations explicitly using a separate DDL-capable role, and keep production database data and Data Protection keys in dedicated persistent storage. Production services must not use `dotnet watch`, source bind mounts, Expo Go/Metro, or local development volumes.

The API uses ASP.NET Core Identity with PostgreSQL persistence and `UseSnakeCaseNamingConvention()`. Account endpoints support Admin, Staff, and Customer roles, with cookie sessions for supplier web users and JWT plus rotating refresh sessions for Customer clients. See the [authentication feature spec](features/authentication/spec.md) for endpoint contracts, CSRF, and sessions. The authenticated Customer reporting API supports report submission, customer-owned listing, detail retrieval, and messaging; the Staff report queue and ticket workspace implements staff response operations, Customer messaging, and SignalR updates. Admins can create, list, read, and update site records through the Supply Site Management API and web frontend. Supplier personnel can read site supply summaries and history through the Manual Supply Monitoring API; Staff can append manual supply readings. Dedicated `GET /api/staff/map/sites` and `GET /api/staff/map/reports` endpoints expose paginated map summaries to fully onboarded personnel, without customer contact details, descriptions, or conversations. The Weather Warnings API provides Admin threshold settings and personnel site assessments backed by persistent Open-Meteo forecasts. See the [Customer reporting API spec](features/customer-reporting/specs.md), [Staff report workspace spec](features/staff-report-workspace/spec.md), [Supply Site Management spec](features/supply-site-management/spec.md), [Manual Supply Monitoring spec](features/manual-supply-monitoring/spec.md), [Supplier Portal Map spec](features/supplier-portal-map/spec.md), and [Weather Warnings API spec](features/weather-warnings/spec.md) for contracts and explicit migration instructions.

Tailwind CSS is installed in the web workspace through `tailwindcss` and `@tailwindcss/vite`. Register the plugin in `apps/web/vite.config.ts` and import `tailwindcss` from `apps/web/src/index.css`, following the [official Vite integration](https://tailwindcss.com/docs/installation/using-vite). Use Tailwind utilities for web styling; no separate PostCSS setup or Tailwind configuration file is needed for this initial integration.

The web app includes supplier authentication screens, dashboards, the Staff report queue and ticket workspace, and Admin supply-site management, using React Router and TanStack Query. Supply-site forms load the canonical PSGC region files on demand and use React Leaflet with Geoapify tiles to select an independent map pin; coordinates are sent internally without numeric coordinate controls. Admin and Staff can review manual supply status/history at `/supply-monitoring`, with Staff-only recording. Both roles can use `/map` for site and report locations, status/priority filters, accessible location selection, and links to the existing detail screens. The map uses React Leaflet/Geoapify and dedicated Application/Infrastructure read projections over the existing schema; no migration is added. Personnel weather monitoring at `/weather-monitoring` uses the existing Weather Warnings API, Recharts forecasts and daily counts, and a React Leaflet/Geoapify site map. Its site assessment and Admin threshold pages retain server-side warning decisions and separate supply/forecast timestamps. Customer supplier-site maps, supply display, and weather presentation remain deferred; see the [Weather Warnings spec](features/weather-warnings/spec.md). Shared browser primitives belong in `packages/ui` and are consumed through its public exports; see that package's README for the available components. Customer reporting and messaging have API support; `apps/mobile` implements native Customer login, required password onboarding, Home with the latest owned report and supplier response, report submission with canonical PSGC selectors and Leaflet/Geoapify map-pin and optional GPS location selection, paginated report history, report details, and a separate status-aware supplier conversation screen using TanStack Query. Mobile sessions remain in memory, with serialized refresh rotation and explicit logout. Mobile reporting polls Home/open report and conversation screens while active and supports pull-to-refresh; replies are limited to InProgress reports. Mobile Updates and Profile use the existing Customer APIs, with session-local read state; server-persisted notification read state remains deferred. See `README.md` and `apps/mobile/README.md` for setup and verification commands.

## 3. API: Clean Architecture with feature organization

Use four separate .NET projects to enforce layer boundaries. Within each layer, organize related code by feature, such as Reports, SupplySites, Accounts, and Weather. Create feature folders only where that layer has responsibilities for the feature; do not create empty matching structures.

| Project | Responsibilities |
| --- | --- |
| `Aqours.Domain` | Business entities, value objects, invariants, and domain rules |
| `Aqours.Application` | Use cases, orchestration, application validation, and interfaces required by use cases |
| `Aqours.Infrastructure` | Persistence, Identity integration, external HTTP clients, and implementations of application interfaces |
| `Aqours.Api` | Minimal API endpoints, transport contracts, HTTP response mapping, authentication/authorization configuration, and dependency wiring |

For example, a report use case belongs under `Aqours.Application/Features/Reports/`, while report endpoints belong under `Aqours.Api/Features/Reports/`. Domain models can live under `Aqours.Domain/Features/Reports/` and persistence implementations under `Aqours.Infrastructure/Features/Reports/`.

Chat message attachments follow the same feature boundary. The API binds JSON or multipart message requests and returns attachment metadata; Domain owns attachment metadata invariants, Application coordinates authorization and storage, and Infrastructure stores the metadata row in PostgreSQL while writing original image bytes through the filesystem storage adapter. PostgreSQL stores only a relative `storage_key`, not image bytes. The filesystem root comes from `ChatAttachments:RootPath`. The service writes files before the message transaction, which then saves the message and attachment metadata under the existing report-row lock. Back up the database and attachment files as a pair, and review mismatches manually; there is no background orphan cleanup. See the [chat attachment spec](features/chat-attachments/spec.md) and [deployment runbook](deployment.md).

### Dependency rules

- Domain has no project references to other application layers and no dependency on ASP.NET Core, persistence frameworks, Identity, or external providers.
- Application references Domain. It must not reference Infrastructure or Api, or depend on HTTP context, concrete database access, or provider SDKs.
- Infrastructure references Application and Domain and implements the interfaces they require.
- Api references Application and Infrastructure. Use Infrastructure from the composition root to register implementations; endpoints invoke application use cases rather than concrete infrastructure services.
- Never introduce a circular project reference or reverse these dependencies.

### Separation of concerns

- Keep endpoints thin: bind requests, enforce access requirements, invoke a use case, and map its outcome to HTTP.
- Keep business invariants in Domain and use-case coordination in Application. Do not put business decisions in endpoint handlers, database adapters, or external API clients.
- Define interfaces at the boundary that needs them and implement external concerns in Infrastructure. Do not create an interface for every class.
- Use explicit request and response contracts. Do not expose persistence or Identity entities directly to clients.
- Enforce ownership and role permissions on the backend. Client checks improve navigation but do not grant access.
- Keep persistence queries and external service details behind the appropriate application boundary. Keep domain and application logic testable without a running HTTP server or external provider.

## 4. Web and mobile: feature-based organization

Both clients organize implementation by product feature:

```text
src/
  app/                  # Startup, providers, routing or navigation setup
  features/
    reports/            # Feature screens, components, hooks, queries, API calls, types
    supply-sites/
    accounts/
  shared/               # Reusable code within this application
```

- Colocate code with its feature. Add subfolders only when the feature needs them.
- Keep application setup separate from feature implementation. Use React Router for web routes.
- Expose deliberate feature entry points when another feature needs a capability. Do not reach into another feature's private implementation.
- Use TanStack Query for server state in both clients, including loading, failures, cache invalidation after mutations, and refreshing data. Keep temporary form and interaction state local unless sharing is necessary.
- Treat the API as the authority for business state and access control. Handle loading, empty, failed, and stale server-data states explicitly.
- Keep code in a feature when it serves that feature. Use an application's `shared/` folder for concrete reuse within that application.
- Use `packages/ui` for concrete reusable browser UI shared across web features, even when the web app is currently the only consumer. Pages must use its public components rather than copying repeated structure or styling. Keep route definitions, feature behavior, permissions, and data fetching in the application; pass required labels, state, and callbacks into shared UI through component props.
- Keep viewport-level navigation independent of page content height. Give the sidebar a viewport-bound height and its own overflow when needed; let the main page content scroll independently. At narrow widths, provide an accessible responsive navigation pattern. Use semantic navigation landmarks, accessible names, keyboard operation, and visible focus.
- Keep `packages/ui` browser-only. React Native must use native components and must not import DOM-based components from the shared web package.
- Move code into another `packages/` package when multiple applications need it and the code is compatible with those consumers.

## 5. Shared packages

| Package | Purpose |
| --- | --- |
| `packages/ui` | Public reusable browser UI components used by the web app across product features; not for React Native |
| `packages/psgc` | Framework-independent Philippine location JSON shared by web, mobile, and API |

Packages must not depend on application source. Keep their public interfaces small. Add packages for other shared concerns only when concrete reuse justifies them; do not create speculative package scaffolding.

### Philippine location data

- Maintain one canonical dataset in `packages/psgc/data`. See the package README for provenance and consumption details.
- Read `data/list-of-all-regions.json` first, then load the region file referenced by the chosen entry's `file` property. Preserve the relative directory structure.
- Preserve PSGC codes as strings, including leading zeroes. Do not rewrite the source hierarchy into incompatible application-specific copies.
- Web and mobile consume `@aqours/psgc` through pnpm workspace dependencies when those workspaces are created. Bundle the required JSON through each client's supported asset mechanism.
- The API accesses the same files through Infrastructure. Link the dataset as .NET content and copy it into build and publish output; do not rely on the repository's location at runtime.
- Document dataset updates and validate the JSON and region references whenever replacing the dataset.

## 6. External services and credentials

- Keep weather-provider requests and other privileged integrations behind the API, with provider-specific implementation in Infrastructure.
- Use Geoapify tiles with the chosen client map implementation. Treat client-visible tile keys as public credentials and apply provider-supported restrictions; keep privileged credentials on the server.
- Never commit secrets. Supply credentials through environment configuration or appropriate local secret storage.
- Handle external-service failures and identify missing or stale data. Do not silently interpret unavailable weather data as evidence that no supply risk exists.

## 7. Dependencies and simplicity

- Ask the user before adding dependencies beyond the agreed stack. This applies to runtime dependencies, development dependencies, NuGet packages, and new third-party services.
- Use the agreed technologies and built-in capabilities first. Explain the need and tradeoff when requesting an additional dependency.
- Do not overengineer. Prefer the smallest clear implementation that satisfies the current MVP and preserves the boundaries above.
- Do not introduce speculative abstractions, generic repository frameworks, messaging infrastructure, microservices, or extra architectural layers without a concrete requirement.
- Add tests for important business rules, authorization, and integration boundaries. Keep checks proportional to the change.
