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
| Local development runner | Root `concurrently`; `pnpm dev` waits for PostgreSQL, then runs API and web together |
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

React Leaflet is for the web application. Mobile report location selection uses the approved Expo-compatible `react-native-maps` with platform map providers and `expo-location` for optional, single foreground GPS reads. Obtain approval before adding other mobile mapping dependencies. Check mobile behavior on a real phone, including connectivity to the development API.

Use ASP.NET Core Identity for account and password management; do not implement custom password hashing or credential storage. Backend authorization remains mandatory regardless of client-side route or screen restrictions.

### Local PostgreSQL and scaffold status

`compose.yaml` uses the exact `postgres:18.6-alpine3.23` image already present on the development device. `pull_policy: never` keeps startup on that local image; on a new device explicitly run `docker pull postgres:18.6-alpine3.23` first. The Compose project is named `aqours-hackathon`, with its own `database` volume, to avoid sharing the existing `aqours` Compose project's container or data.

The database binds to `127.0.0.1:5433` by default; container connections use `db:5432`. Port 5433 avoids the existing PostgreSQL container on host port 5432. Override `POSTGRES_PORT` in the root ignored `.env` when needed. Configure `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` there using `.env.example` as the template. Never commit the real password.

Persist PostgreSQL 18 data at `/var/lib/postgresql`, with the image's default version-specific data directory underneath it, as required by the [official image documentation](https://github.com/docker-library/docs/blob/master/postgres/README.md#pgdata). The health check uses `pg_isready`; `docker compose up -d --wait db` waits for readiness. `docker compose down` retains the volume. Initialization environment variables apply when the volume is first created; editing them later does not change existing database roles or passwords.

The API exposes a process health endpoint at `/health`; it does not report PostgreSQL readiness. Infrastructure registers `AqoursDbContext`, derived from `IdentityDbContext`, with Npgsql and `UseSnakeCaseNamingConvention()`. Account endpoints support Admin, Staff, and Customer roles, with cookie sessions for supplier web users and JWT plus rotating refresh sessions for Customer clients. See [authentication setup](authentication.md) and the [authentication feature spec](features/authentication/spec.md) for endpoint contracts, secrets, CSRF, and sessions. The authenticated Customer reporting API supports report submission, customer-owned listing, detail retrieval, and messaging; the Staff report queue and ticket workspace implements staff response operations, Customer messaging, and SignalR updates. See the [Customer reporting API spec](features/customer-reporting/specs.md) and [Staff report workspace spec](features/staff-report-workspace/spec.md) for contracts and explicit migration instructions. The Domain layer owns the Account entity and role names; Infrastructure adapts them to Identity persistence. Migrations are in `Aqours.Infrastructure/Persistence/Migrations`; account seeding is in `Aqours.Infrastructure/Persistence/Seeders`. Use Infrastructure as the migration project and Api as the startup project. The connection string, JWT settings, and `SeedAdmin:Email` are required at startup; initial administrator name and password are required only when creating that account. Docker Compose's `.env` is not automatically loaded by ASP.NET Core. Apply migrations explicitly; API startup verifies schema state and seeds roles plus the configured initial Admin, but does not modify the schema.

Tailwind CSS is installed in the web workspace through `tailwindcss` and `@tailwindcss/vite`. Register the plugin in `apps/web/vite.config.ts` and import `tailwindcss` from `apps/web/src/index.css`, following the [official Vite integration](https://tailwindcss.com/docs/installation/using-vite). Use Tailwind utilities for web styling; no separate PostCSS setup or Tailwind configuration file is needed for this initial integration.

The web app includes supplier authentication screens, a dashboard shell, and the implemented Staff report queue and ticket workspace, using React Router and TanStack Query. Shared browser primitives belong in `packages/ui` and are consumed through its public exports; see that package's README for the available components. Customer reporting and messaging have API support; `apps/mobile` implements native Customer login, required password onboarding, Home with the latest owned report and supplier response, report submission with canonical PSGC selectors and map/GPS/coordinate location selection, paginated report history, and report details with supplier conversations using TanStack Query. Mobile sessions remain in memory, with serialized refresh rotation and explicit logout. Mobile reporting polls Home/open details while active and supports pull-to-refresh; replies are limited to InProgress reports. Supplier-site maps, supply and weather workflows, an Updates inbox, and full Profile remain deferred. See `README.md` and `apps/mobile/README.md` for setup and verification commands.

## 3. API: Clean Architecture with feature organization

Use four separate .NET projects to enforce layer boundaries. Within each layer, organize related code by feature, such as Reports, SupplySites, Accounts, and Weather. Create feature folders only where that layer has responsibilities for the feature; do not create empty matching structures.

| Project | Responsibilities |
| --- | --- |
| `Aqours.Domain` | Business entities, value objects, invariants, and domain rules |
| `Aqours.Application` | Use cases, orchestration, application validation, and interfaces required by use cases |
| `Aqours.Infrastructure` | Persistence, Identity integration, external HTTP clients, and implementations of application interfaces |
| `Aqours.Api` | Minimal API endpoints, transport contracts, HTTP response mapping, authentication/authorization configuration, and dependency wiring |

For example, a report use case belongs under `Aqours.Application/Features/Reports/`, while report endpoints belong under `Aqours.Api/Features/Reports/`. Domain models can live under `Aqours.Domain/Features/Reports/` and persistence implementations under `Aqours.Infrastructure/Features/Reports/`.

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
