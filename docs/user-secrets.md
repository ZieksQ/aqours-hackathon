# Local API user secrets

Use .NET user secrets for local API credentials when running the API on the host. The API project already has a `UserSecretsId`; run these commands from the repository root. User secrets are scoped to this project and override matching `appsettings.json` values in Development.

The recommended Docker Compose workflow gets API settings from explicitly mapped root `.env` values instead. Compose does not mount the developer's user-secrets directory into the API container. See the [authentication setup](authentication.md) for the mapping from Docker variable names to ASP.NET Core configuration keys. Do not put privileged credentials in web or mobile environment variables.

## Prepare PostgreSQL for host development

The root `.env.example` contains Compose settings for PostgreSQL and the Docker workflow. Copy it to root `.env` only if that file does not already exist, then replace the database password placeholder:

```sh
if [ ! -f .env ]; then cp .env.example .env; fi
```

Preserve an existing `.env` and its local database password; do not overwrite it with the example. Start PostgreSQL with `pnpm db:up`. For the host-run API, configure its connection string separately with user secrets:

```sh
dotnet user-secrets set "ConnectionStrings:Aqours" "Host=localhost;Port=5433;Database=aqours;Username=aqours;Password=<POSTGRES_PASSWORD from .env>" --project apps/api/src/Aqours.Api
```

Replace the placeholder with the value in `.env`; do not include the angle brackets. The host connection uses `localhost:5433`, while the Docker API service uses `db:5432` through `DOCKER_API_CONNECTION_STRING`.

## Configure API authentication and the initial administrator

Set a JWT signing key with at least 32 UTF-8 bytes. The following generates a random Base64 key in common shells with OpenSSL:

```sh
dotnet user-secrets set "Jwt:SigningKey" "$(openssl rand -base64 48)" --project apps/api/src/Aqours.Api
```

Set the issuer, audience, and initial administrator details. Choose your own email and a unique password; the password must be at least 12 characters and include uppercase, lowercase, a digit, and a non-alphanumeric character.

```sh
dotnet user-secrets set "Jwt:Issuer" "Aqours.Local" --project apps/api/src/Aqours.Api
dotnet user-secrets set "Jwt:Audience" "Aqours.WebAndMobile" --project apps/api/src/Aqours.Api
dotnet user-secrets set "SeedAdmin:Email" "admin@example.test" --project apps/api/src/Aqours.Api
dotnet user-secrets set "SeedAdmin:FirstName" "Aqours" --project apps/api/src/Aqours.Api
dotnet user-secrets set "SeedAdmin:LastName" "Administrator" --project apps/api/src/Aqours.Api
dotnet user-secrets set "SeedAdmin:Password" "<your unique password>" --project apps/api/src/Aqours.Api
```

`SeedAdmin:Email` is required on every API start. The name and password values are used only if that administrator account does not exist yet. The seeder does not reset an existing account's password.

List configured values with:

```sh
dotnet user-secrets list --project apps/api/src/Aqours.Api
```

Remove a value with `dotnet user-secrets remove "SeedAdmin:Password" --project apps/api/src/Aqours.Api`, or clear all API user secrets with `dotnet user-secrets clear --project apps/api/src/Aqours.Api`.

Keep `.env`, passwords, connection strings, and signing keys out of source control. In deployed environments, use a secret manager or environment variables; nested names use double underscores, such as `Jwt__SigningKey` and `SeedAdmin__Email`. The development Compose file is not a production deployment configuration.
