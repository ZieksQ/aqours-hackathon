# Repository guidance

## Project context

Aqours is a water reporting and supplier response system with a customer mobile app, supplier web portal, manual supply monitoring, and weather-based warnings. Keep work focused on the one-week MVP.

The repository contains the .NET API layer projects, a React web app with supplier account screens, Docker PostgreSQL configuration, product and architecture documents, and the shared Philippine location dataset. Account authentication, the Customer reporting API, and the supplier personnel manual supply monitoring API are implemented. The Staff report queue and ticket workspace and Customer mobile login/Home, report submission with location selection, owned-report history, and supplier conversations are implemented; supplier supply monitoring UI, Customer supply display and site maps, weather, Updates, and full Profile remain deferred.

## Basic technology stack

- Backend: .NET 10 / C#, ASP.NET Core Minimal API, ASP.NET Core Identity for account management and authentication.
- .NET projects and namespaces use PascalCase: `Aqours.Domain`, `Aqours.Application`, `Aqours.Infrastructure`, and `Aqours.Api`; follow the Clean Architecture reference rules in `docs/architecture.md`.
- Web: React with TypeScript, Vite, ESLint, and Tailwind CSS; React Router and TanStack Query are the agreed routing and server-state tools.
- Shared web UI: use the reusable primitives in `@aqours/ui` for portal interface elements. Before adding a new primitive, check the package's public exports and extend a concrete shared component when appropriate; do not duplicate shared markup in pages. Keep feature behavior, routes, and data access in `apps/web`.
- Icons: use the installed Feather icon set from `react-icons/fi` for web UI rather than hand-drawn Unicode or copied SVG markup. Mark decorative icons `aria-hidden="true"`; icon-only controls need an accessible name. Preserve the existing custom Aqours brand mark in `apps/web/src/shared/Brand.tsx` instead of replacing it with a library icon.
- Database: PostgreSQL 18.6 using the locally installed `postgres:18.6-alpine3.23` Docker image. Keep persistence implementations in Infrastructure; EF Core with Npgsql, Identity persistence, snake_case naming, and the initial authentication migration are configured. Apply migrations explicitly; API startup does not modify the schema.
- Maps and weather: React Leaflet with Geoapify tiles on the web; Open-Meteo behind the API.
- Tooling: pnpm workspace for JavaScript, NuGet/.NET CLI for .NET, Docker Compose for the local database, and root `concurrently` for running the API and web app together. See `README.md` for startup commands.
- Mobile: React Native with Expo Go; Customer login, Home, reporting with approved Leaflet/Geoapify in `react-native-webview` and `expo-location`, owned-report history, and supplier conversations live in `apps/mobile`; other feature screens remain deferred. Test by connecting Expo Go on a real mobile phone to the development server. Do not create APKs, native builds, or use emulators/simulators for mobile testing.

## Important documentation

Read the documents relevant to the task before making changes. Read both context and architecture before implementing application features. Architecture takes precedence over the earlier candidate stack in the context document.

| File | Purpose | When to read |
| --- | --- | --- |
| `docs/context.md` | Application context, users, MVP workflows, scope, and acceptance criteria | When defining or changing product behavior |
| `docs/architecture.md` | Required stack, monorepo layout, layer boundaries, and dependency rules | Before scaffolding projects or changing implementation, structure, or dependencies |
| `docs/PROGRESS.md` | Short record of completed features and fixes | At the start of related work and when recording completed changes |
| `docs/memory/` | Archived progress records, created when needed | When older implementation history is relevant |

For location data work, also read `packages/psgc/README.md` for provenance, consumption, and validation requirements.

## Git branching and commits

- Every new feature gets a new branch before implementation begins. Use a descriptive name such as `feature/report-submission`.
- Continue related work on its existing feature branch; create a separate branch for a different feature.
- Check the current branch and working tree first. Preserve unrelated user changes and never discard them to switch branches.
- After finishing code or documentation changes, run the relevant verification and create a Git commit with a descriptive message. Include only changes related to the completed task; preserve unrelated user changes.
- If Git metadata is unavailable or a commit cannot be created, report the limitation rather than claiming a branch or commit was created.

## Commands and scaffolding

- Prefer official CLI commands for scaffolding, dependency management, project references, migrations, and generated configuration instead of manually creating or editing their generated files.
- Use `dotnet new`, `dotnet sln`, `dotnet add`, and other .NET CLI commands where appropriate. Use `pnpm` for JavaScript workspace and package operations, including supported framework generators.
- Write application code and documentation directly when there is no appropriate generator. Do not run a generator over existing work without checking what it will replace.
- Follow the required stack in `docs/architecture.md`. Ask before adding dependencies beyond the agreed stack, including development dependencies and NuGet packages.
- Use actual project scripts and available CLI commands for verification; do not claim checks ran when they did not.

## Domain entities and layer communication

- Put business entities and their invariants in Domain, organized by feature. Domain must remain independent of ASP.NET Core Identity, EF Core, HTTP, and provider SDKs.
- Keep framework-specific persistence models in Infrastructure (for example, `IdentityAccountUser : IdentityUser`), map them to the Domain entity, and never expose them through API responses.
- Define use cases and the interfaces they need in Application. Infrastructure implements those interfaces; API endpoints call Application use cases and return explicit transport DTOs. Do not have layers communicate by reaching into concrete persistence services.

## Persistence organization

- Keep database setup and support code in Infrastructure under `Persistence/`, with separate folders for each concern: `Persistence/Seeders/` for seed data and seeding services, `Persistence/Migrations/` for generated EF migrations and snapshots, and dedicated folders such as `Persistence/Configurations/` when those concerns are introduced. Keep the DbContext at the Persistence root; feature-specific storage adapters can stay under `Features/` according to the architecture.
- Generate migrations with the EF CLI using `--output-dir Persistence/Migrations`; keep folder and namespace organization consistent, and do not mix seeders or migrations into feature service folders.

## Code formatting

- Format every code file you create or change before verification and committing. Use the existing formatter or language tooling (for example, `dotnet format` for C# and the web formatter plus ESLint for TypeScript/React); preserve the repository conventions and avoid unrelated formatting changes.
- Run available formatting checks and report any limitation; generated code should follow its official generator’s formatting.

## Web UI reuse and navigation

- Use `packages/ui` for concrete web UI primitives reused across portal screens, including shared navigation chrome. Pages must consume the package's public components instead of copying equivalent markup or styles.
- Keep application-specific labels, navigation destinations, permissions, route definitions, and business behavior in `apps/web`; shared components receive the data and callbacks they need through their public props.
- Keep portal sidebars and navigation bars sized against the viewport, not the height of page content. Long navigation and page content should scroll independently so a short page does not collapse the sidebar and a long page does not stretch it.
- Navigation must remain usable at narrow widths and with keyboard and assistive technology: use semantic navigation landmarks, accessible names, visible focus, and responsive behavior that does not hide destinations without an accessible way to reach them.
- `packages/ui` is browser UI for the React web app. React Native screens must use native components and must not import browser DOM components from this package.

## Keep implementation simple

- Do not over-engineer. Implement the smallest clear solution that meets the current requirement and respects the documented architecture.
- Avoid speculative abstractions, unnecessary packages, empty scaffolding, and unrelated refactors.
- Reuse existing patterns and built-in capabilities. Add shared abstractions only when concrete reuse warrants them.
- Keep verification proportional to the change, focusing on business rules, authorization, and integration boundaries when relevant.

## Progress records

- Maintain `docs/PROGRESS.md`; create it if it is missing.
- After each completed feature or fix, append a dated entry with a short description of what changed. Keep each entry to one or two sentences; include a material verification result or limitation when useful.
- Record completed work accurately. Do not present planned features as implemented or copy full task transcripts and command logs into the progress record.
- Keep the active record at or below 100 lines and 1,500 words. If an update exceeds either limit, create `docs/memory/` and move the oldest entries into a descriptive archive such as `docs/memory/progress-2026-10-25-01.md` until the active record is within both limits.
- Preserve entry dates and order, never overwrite an archive, and keep a compact link to each archive in `docs/PROGRESS.md`. Read archives only when needed for the current task.
