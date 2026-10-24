# Repository guidance

## Project context

Aqours is a water reporting and supplier response system with a customer mobile app, supplier web portal, manual supply monitoring, and weather-based warnings. Keep work focused on the one-week MVP.

The repository contains the .NET API layer projects, a React web starter, Docker PostgreSQL configuration, product and architecture documents, and the shared Philippine location dataset. The mobile app and MVP business features are not implemented yet.

## Basic technology stack

- Backend: .NET 10 / C#, ASP.NET Core Minimal API, ASP.NET Core Identity for planned account management.
- .NET projects and namespaces use PascalCase: `Aqours.Domain`, `Aqours.Application`, `Aqours.Infrastructure`, and `Aqours.Api`; follow the Clean Architecture reference rules in `docs/architecture.md`.
- Web: React with TypeScript, Vite, ESLint, and Tailwind CSS; React Router and TanStack Query are the agreed routing and server-state tools.
- Database: PostgreSQL 18.6 using the locally installed `postgres:18.6-alpine3.23` Docker image. Keep persistence implementations in Infrastructure; a .NET database provider and migrations have not been added.
- Maps and weather: React Leaflet with Geoapify tiles on the web; Open-Meteo behind the API.
- Tooling: pnpm workspace for JavaScript, NuGet/.NET CLI for .NET, Docker Compose for the local database, and root `concurrently` for running the API and web app together. See `README.md` for startup commands.
- Mobile: React Native with Expo Go is planned; creation is deferred at the user's request.

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
