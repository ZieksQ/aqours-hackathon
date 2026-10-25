# Local API user secrets

Use .NET user secrets for local API credentials. The API project already has a `UserSecretsId`; run these commands from the repository root. User secrets are scoped to this project and override matching `appsettings.json` values in Development.

## Prepare PostgreSQL

The root `.env.example` contains the variables Docker Compose needs. Copy it to `.env` and replace the placeholder password:

```sh
cp .env.example .env
```

Skip the copy if `.env` already exists. Start PostgreSQL with `pnpm db:up`. Compose does not pass its `.env` values to the API, so configure the API connection separately:

```sh
dotnet user-secrets set "ConnectionStrings:Aqours" "Host=localhost;Port=5433;Database=aqours;Username=aqours;Password=<POSTGRES_PASSWORD from .env>" --project apps/api/src/Aqours.Api
```

Replace the placeholder with the value in `.env`; do not include the angle brackets.

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

Keep `.env`, passwords, connection strings, and signing keys out of source control. In deployed environments, use a secret manager or environment variables; nested names use double underscores, such as `Jwt__SigningKey` and `SeedAdmin__Email`.
