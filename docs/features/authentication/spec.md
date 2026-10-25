# Authentication feature

## Status and scope

The API implements account authentication for supplier portal users and customer mobile clients. The web starter includes supplier sign-in, first-login password change, account creation, and session-aware routing. This feature does not implement the remaining report, site, supply, map, or weather workflows. The mobile application is deferred; mobile auth endpoints are available for a future client.

Supported roles are `Admin`, `Staff`, and `Customer`. Every new account is flagged to change its initial password. Account creation is currently an Admin-only API action. The startup seeder provisions roles and one initial Admin from configuration.

## HTTP contracts

All endpoints are under `/api`. JSON uses camelCase fields. Unauthorized requests return `401`; authenticated users without the required role or full-session status receive `403`. Validation failures return `400` with a validation-problem response. API responses carry `Cache-Control: no-store`.

| Method and path | Request | Result and access |
| --- | --- | --- |
| `GET /auth/web/csrf` | none | `200 { requestToken }`; sets the antiforgery cookie for same-origin web writes |
| `POST /auth/web/login` | `{ email, password }` | Supplier Admin/Staff only; `200 AccountInfo` and an HTTP-only session cookie |
| `POST /auth/web/logout` | none | Admin/Staff web session, including a password-change-restricted session, plus CSRF token; `204`, clears the session cookie |
| `POST /auth/mobile/login` | `{ email, password }` | Customer only; `200 MobileSessionResponse` |
| `POST /auth/mobile/refresh` | `{ refreshToken }` | Rotates a valid Customer refresh token; `200 MobileSessionResponse`, otherwise `401` |
| `POST /auth/mobile/logout` | `{ refreshToken }` | Revokes the token's refresh family; `204` even for an unknown token |
| `GET /auth/me` | none | Authenticated web or mobile session; `200 AccountInfo` |
| `POST /auth/change-password` | `{ currentPassword, newPassword }` | Authenticated session; `200 AccountInfo` for web or `MobileSessionResponse` for mobile |
| `POST /accounts` | `{ email, firstName, middleName?, lastName, initialPassword, role }` | Full Admin web session plus CSRF token; `201 AccountInfo` |

`AccountInfo` is `{ id, email, firstName, middleName, lastName, role, requiresPasswordChange }`. `MobileSessionResponse` contains `account`, `accessToken`, `accessTokenExpiresAt`, `refreshToken`, and `refreshTokenExpiresAt`. Refresh fields are `null` until the Customer changes the initial password.

## Access and password rules

- Web login accepts Admin and Staff accounts. Customer accounts use the mobile login endpoint; mobile login accepts Customers only.
- Web sessions use an HTTP-only `Aqours.Session` cookie, `SameSite=Lax`, with `Secure` enabled outside Development. Normal sessions expire in eight hours without sliding renewal. Initial-password sessions expire in ten minutes.
- Mobile access tokens are signed JWTs with issuer, audience, expiry, `sub`, `role`, `jti`, password-change state, and session-stamp claims. They last 15 minutes after onboarding, or 10 minutes while password change is required. Validation requires the configured issuer/audience, HMAC-SHA256 signature, zero clock skew, a current Identity security stamp, and a Customer role.
- Identity requires a unique email and passwords of at least 12 characters with uppercase, lowercase, digit, and non-alphanumeric characters. Five failed password attempts lock an account for 15 minutes. Login failures intentionally do not reveal whether an account exists, its client type, or lock status.
- Creating an account is all-or-nothing across user creation and role assignment. Duplicate email is rejected case-insensitively by the database uniqueness constraint. Account response contracts never expose Identity persistence objects.
- Password change verifies the current password, clears the forced-change flag, changes the Identity security stamp, and revokes stored refresh families. Existing access tokens and web cookies fail subsequent stamp validation.
- The default authorization policy requires an authenticated, fully onboarded session. The Admin creation policy requires the `Admin` role; web portal policy accepts `Admin` or `Staff`. Future API routes must keep an explicit authorization policy.

## Browser CSRF behavior

The web client obtains a request token from `GET /api/auth/web/csrf`, receives the HTTP-only `Aqours.Csrf` cookie (`SameSite=Strict`), and sends `requestToken` in `X-CSRF-TOKEN` for each state-changing web request. Web login, logout, password change, and account creation enforce antiforgery validation. The client obtains a fresh token after login or password change because request tokens are identity-bound. The mobile bearer flow does not use cookies or CSRF tokens; only a Bearer-authenticated request can bypass CSRF validation on the shared password-change endpoint.

The authentication setup follows the ASP.NET Core [JWT bearer guidance](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/configure-jwt-bearer-authentication?view=aspnetcore-10.0) and [antiforgery guidance](https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0); the behavior and lifetimes above describe this project's configuration.

## Mobile refresh rotation and replay handling

Only onboarded Customers receive a refresh token. Each token contains 64 random bytes encoded as Base64; only its SHA-256 hash is stored. A refresh family has a fixed seven-day expiry. Refresh consumes the presented token and returns a new access token and one-time refresh token.

Refresh rotation and replay handling serialize on the refresh-family row lock. Reuse of a consumed token, use after expiry/revocation, or a stale Identity security stamp revokes the entire family. Thus, when two requests race with the same refresh token, at most one rotation succeeds; the other is rejected and revokes the family's newly issued descendant token too. Mobile logout revokes only the supplied token's family. Access JWTs remain valid until their 15-minute expiry unless the corresponding account's security stamp changes, which is checked against the database per request.

## Database and startup behavior

`apps/api/src/Aqours.Api/appsettings.json` includes the `SeedAdmin` email/name defaults and an empty password field; user secrets or environment variables supply the initial password and can override those defaults.

The Domain layer defines the account model and role names. Infrastructure adapts accounts to ASP.NET Core Identity persistence in PostgreSQL and stores `refresh_families` and `refresh_tokens`. Naming uses snake_case; normalized email is unique, and the user-role join table limits each account to one role. The initial migration is in `Aqours.Infrastructure/Persistence/Migrations`. The API requires a configured connection string, JWT issuer/audience/signing key, and seed-admin email at startup; seed-admin name and password are needed when creating the initial admin. It explicitly does not run migrations. Apply committed EF migrations before launching; startup checks for pending migrations, ensures the three supported roles exist, and seeds the initial admin transactionally. See [authentication setup](../../authentication.md) for local secrets, migration, and test-database commands.

## Deferred

- Customer and supplier mobile app screens and secure client token storage.
- Email verification, password reset/recovery, MFA, invitation links, and self-service registration.
- Admin account editing, deletion, role changes, and disabling accounts.
- Refresh tokens for supplier web sessions, cross-device session management, and a refresh-family cleanup job.
- Business API routes and their report ownership/location authorization; these must be implemented before the wider MVP workflows are considered complete.

## Verification

- The .NET solution built with zero warnings and errors; `dotnet format --verify-no-changes` passed, and EF reported no pending model changes.
- The PostgreSQL authentication integration suite passed 12/12 tests with no failures or skips. It covers migrations and repeatable seeding, roles, CSRF, lockout and password changes, cookie and JWT validity, and refresh rotation, replay, concurrency, expiry, and logout.
- The web production build (including the favicon), lint, and Prettier check passed. Browser checks covered seeded Admin password onboarding, dashboard access, account creation and duplicate rejection, Staff password change and denied Admin access, mobile navigation and keyboard behavior, and logout followed by protected-route redirect.
- The visual inspection scored 7.5/10 with zero failures. Its two warnings concerned centered sign-in whitespace and a canvas heuristic that assumes a sidebar on the sign-in screen; both were accepted as intentional layout behavior.
