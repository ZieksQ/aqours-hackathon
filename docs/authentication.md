# Authentication setup

The API requires PostgreSQL, JWT settings, and `SeedAdmin:Email` at startup. When that administrator does not exist yet, also configure the initial administrator's first name, last name, and password (middle name is optional). The API does not create the schema automatically. Apply the EF Core migration explicitly, then start the API; startup verifies there are no pending migrations and seeds the three roles plus the configured first administrator. See [the authentication feature spec](features/authentication/spec.md) for endpoint and session behavior.

## 1. Configure local secrets

`apps/api/src/Aqours.Api/appsettings.json` includes a `SeedAdmin` section with development email/name defaults and an empty `Password` field. Change those nonsecret defaults there as needed; supply the initial password through user secrets or `SeedAdmin__Password`. User secrets in Development and environment variables override appsettings values.

Start PostgreSQL using the root `.env` and `pnpm db:up`. Docker Compose settings are not automatically loaded by ASP.NET Core. Store API settings in .NET user secrets for the API project:

```sh
dotnet user-secrets set "ConnectionStrings:Aqours" "Host=localhost;Port=5433;Database=aqours;Username=aqours;Password=<the POSTGRES_PASSWORD from .env>" --project apps/api/src/Aqours.Api
dotnet user-secrets set "Jwt:Issuer" "Aqours.Local" --project apps/api/src/Aqours.Api
dotnet user-secrets set "Jwt:Audience" "Aqours.WebAndMobile" --project apps/api/src/Aqours.Api
dotnet user-secrets set "Jwt:SigningKey" "<a random secret of at least 32 UTF-8 bytes>" --project apps/api/src/Aqours.Api
dotnet user-secrets set "SeedAdmin:Email" "admin@example.test" --project apps/api/src/Aqours.Api
dotnet user-secrets set "SeedAdmin:FirstName" "Aqours" --project apps/api/src/Aqours.Api
dotnet user-secrets set "SeedAdmin:LastName" "Administrator" --project apps/api/src/Aqours.Api
dotnet user-secrets set "SeedAdmin:Password" "<a unique password meeting the Identity policy>" --project apps/api/src/Aqours.Api
```

Replace every placeholder before use. Keep `.env`, user-secrets files, connection strings, signing keys, and passwords out of source control. The JWT signing key must contain at least 32 UTF-8 bytes. Identity requires passwords of at least 12 characters, including uppercase, lowercase, a digit, and a non-alphanumeric character. A missing setting fails API startup with a configuration error.

For a deployed environment, supply the same configuration keys through a secret manager or environment variables, using double underscores for nested names. For example: `ConnectionStrings__Aqours`, `Jwt__Issuer`, `Jwt__Audience`, `Jwt__SigningKey`, `SeedAdmin__Email`, `SeedAdmin__FirstName`, `SeedAdmin__MiddleName`, `SeedAdmin__LastName`, and `SeedAdmin__Password`.

## 2. Apply the database migration

The initial `InitialAccounts` migration is committed under `apps/api/src/Aqours.Infrastructure/Persistence/Migrations`. Restore the repository-pinned EF tool and apply it explicitly:

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

The browser calls the relative `/api` path. Vite proxies it to `http://localhost:5251` during development, preserving a same-origin browser request for the session and antiforgery cookies. In deployment, route `/api/*` through the web origin to the API, and configure the web host to return the SPA's `index.html` for client routes such as `/sign-in`, `/dashboard`, `/change-password`, and `/accounts/new`. Keep browser authentication same-origin; cookie and CSRF behavior depends on that routing.

## Integration test database

The API integration suite uses a real PostgreSQL database and migrates it. Create a separate disposable database named `aqours_auth_integration_tests`, then set `AQOURS_TEST_CONNECTION_STRING` to its connection string before running `dotnet test Aqours.slnx`. The test fixture checks the database name before changing its schema. Never point it at a development or production database.
