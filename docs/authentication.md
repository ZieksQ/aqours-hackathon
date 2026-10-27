# Authentication setup

The API requires PostgreSQL, JWT settings, and `SeedAdmin:Email` at startup. When that administrator does not exist yet, also configure the initial administrator's first name, last name, and password (middle name is optional). The API does not create the schema automatically. Apply the EF Core migration explicitly, then start the API; startup verifies there are no pending migrations and seeds the three roles plus the configured first administrator. See [the authentication feature spec](features/authentication/spec.md) for endpoint and session behavior.

## 1. Configure local secrets

The API requires `ConnectionStrings:Aqours`, `Jwt:Issuer`, `Jwt:Audience`, `Jwt:SigningKey`, and `SeedAdmin:Email`. The initial administrator's first name, last name, and password are needed only when creating that account; middle name is optional. These values are intentionally kept out of the API settings files. See [local API user secrets](user-secrets.md) for setup commands. Docker Compose settings in the root `.env` are not automatically loaded by ASP.NET Core.

For a deployed environment, provide the same configuration through a secret manager or environment variables, using double underscores for nested names. Examples include `ConnectionStrings__Aqours`, `Jwt__Issuer`, `Jwt__Audience`, `Jwt__SigningKey`, `SeedAdmin__Email`, and `SeedAdmin__Password`.

## 2. Apply the database migration

The EF migrations, including `InitialAccounts`, `CustomerReports`, and `StaffReportWorkspace`, are committed under `apps/api/src/Aqours.Infrastructure/Persistence/Migrations`. Restore the repository-pinned EF tool and apply them explicitly:

```sh
dotnet tool restore
dotnet ef database update --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api
```

The design-time context factory reads API user secrets and environment variables without running the normal startup seeder. For future model changes, add migrations to the same Infrastructure folder, then review and commit them with the feature:

```sh
dotnet ef migrations add <MigrationName> --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api --output-dir Persistence/Migrations
```

Apply each migration with `dotnet ef database update`. API startup never runs `Migrate`, `EnsureCreated`, or schema-changing SQL. The seeder refuses to start if EF reports pending migrations.

## 3. Start the applications

Once configuration and schema are ready, start both applications with `pnpm dev`, or start the API alone with `pnpm dev:api`. API startup creates any missing `Admin`, `Staff`, and `Customer` roles and creates the configured administrator only if that email does not already exist. If it exists, the account must already have exactly the `Admin` role; the seeder never promotes the account or resets its password. It fails rather than silently changing a conflicting account. Keep `SeedAdmin:Email` configured on every start; name and password values are only needed to create the initial account.

The web portal is at `http://localhost:5173`, the API is at `http://localhost:5251`, and `/health` reports API process health. `/health` does not establish that the database is healthy; the API itself requires database access and valid settings during startup.

## Web/API routing in deployment

The browser calls the relative `/api` path. Vite proxies it to `http://localhost:5251` during development, preserving a same-origin browser request for the session and antiforgery cookies. In deployment, route `/api/*` through the web origin to the API, and configure the web host to return the SPA's `index.html` for client routes such as `/sign-in`, `/dashboard`, `/change-password`, `/accounts`, and `/accounts/new`. Keep browser authentication same-origin; cookie and CSRF behavior depends on that routing. Staff report workspace mutations also use the web session and must include the antiforgery request token; see the [workspace spec](features/staff-report-workspace/spec.md) for REST and SignalR access rules.

## Account directory

`GET /api/accounts` returns the existing public account DTOs (identity, role, and initial-password-change state) for an unrestricted Admin web session. Anonymous sessions, Staff, Customers, and Admins who have not changed their initial password cannot list accounts; passwords, security stamps, and Identity persistence fields are never returned. The one-organization MVP directory applies name/email, role, password-setup filters and ten-row pagination in the web client.

## Integration test database

The API integration suite uses a real PostgreSQL database and migrates it. Create a separate disposable database named `aqours_auth_integration_tests`, then set `AQOURS_TEST_CONNECTION_STRING` to its connection string before running `dotnet test Aqours.slnx`. The test fixture checks the database name before changing its schema. Never point it at a development or production database.

The realtime SignalR integration test also starts the API with Kestrel on an ephemeral loopback port and launches the official JavaScript client from `apps/web/scripts/verify-reports-realtime.mjs`. Install workspace dependencies first with `pnpm install --frozen-lockfile`; Node.js 22.22.2 or newer is required, and the environment must allow binding and connecting to loopback ports.
