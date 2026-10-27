# Supply Site Management API

## Status and scope

The API provides Admin-only create, list, read, and full-update operations for supplier supply-site records. It is API support for the MVP's site management workflow; this feature does not add a web or mobile management screen.

Supplier sites have a persistent GUID, trimmed name, resolved Philippine address, latitude and longitude, and UTC creation and update timestamps. Names are limited to 200 characters. Duplicate names are allowed. The complete address is selected from canonical PSGC codes and includes required trimmed street or landmark details up to 500 characters. The API resolves and snapshots canonical administrative names. Latitude and longitude must be finite numbers in the inclusive ranges -90 to 90 and -180 to 180. Coordinates are submitted independently: the API does not infer them from an address or check that they fall within the selected administrative area.

## HTTP contract

All routes use the cookie-authenticated Admin policy, which requires a fully onboarded Admin web session. Anonymous requests and Customer bearer sessions receive `401`; Staff web sessions and password-change-restricted Admin sessions receive `403`. JSON uses camelCase and responses are not cacheable under the existing API policy.

| Method and route | Request | Result |
| --- | --- | --- |
| `GET /api/admin/supply-sites?page={page}&pageSize={pageSize}` | Optional query values; defaults are page `1`, pageSize `20` | `200` page response |
| `GET /api/admin/supply-sites/{id}` | GUID | `200` site response or `404` |
| `POST /api/admin/supply-sites` | Complete site body | `201` site response and `Location: /api/admin/supply-sites/{id}` |
| `PUT /api/admin/supply-sites/{id}` | Complete replacement site body | `200` updated response or `404` |

The list sorts by name and then ID for a stable order. `page` must be a positive integer. `pageSize` must be an integer from 1 to 100. Invalid query values return `400` validation problems. An out-of-range page returns an empty `items` array with the requested page metadata. The page response is `{ items, page, pageSize, totalCount }`.

Create and update use the same complete body. Every field is required except `provinceCode` and `subMunicipalityCode`, which may be omitted when the selected PSGC hierarchy has no such level:

```json
{
  "name": "North Reservoir",
  "address": {
    "regionCode": "0100000000",
    "provinceCode": "0102800000",
    "cityMunicipalityCode": "0102801000",
    "subMunicipalityCode": null,
    "barangayCode": "0102801001",
    "details": "Near the old bridge"
  },
  "latitude": 18.4663,
  "longitude": 120.9031
}
```

Codes must identify valid PSGC entries at their specified administrative levels, and each code must be the actual ancestor of the selected barangay. The server returns canonical codes and names for region, optional province, city or municipality, optional sub-municipality, and barangay, along with trimmed `details`. The response shape is:

```json
{
  "id": "b561e448-49d0-4f4a-ab82-7d074f8c61e7",
  "name": "North Reservoir",
  "address": {
    "regionCode": "0100000000",
    "regionName": "Region I (Ilocos Region)",
    "provinceCode": "0102800000",
    "provinceName": "Ilocos Norte",
    "cityMunicipalityCode": "0102801000",
    "cityMunicipalityName": "Adams",
    "subMunicipalityCode": null,
    "subMunicipalityName": null,
    "barangayCode": "0102801001",
    "barangayName": "Adams",
    "details": "Near the old bridge"
  },
  "latitude": 18.4663,
  "longitude": 120.9031,
  "createdAt": "2026-10-27T08:30:00Z",
  "updatedAt": "2026-10-27T08:30:00Z"
}
```

Validation failures return `400` with field-keyed validation problems, including address errors under keys such as `address.regionCode` and `address.details`. Invalid requests do not create a record or modify an existing one. POST and PUT require the web antiforgery request token in `X-CSRF-TOKEN`; missing or invalid tokens return `400`. Reads do not require CSRF validation.

PUT replaces the name, resolved address, and coordinates together. It preserves the record ID and `createdAt`, and sets `updatedAt` to the current UTC time. The last successful write wins; there is no concurrency token or edit conflict response.

## Architecture and persistence

The Domain owns `SupplySite` and its invariants. Application owns the use case, validation, and `ISupplySiteStore`/PSGC resolution interfaces. Infrastructure implements the PostgreSQL store and resolves PSGC codes from the shared `packages/psgc` dataset. API owns the request/response DTOs, routes, Admin policy, CSRF filter, and HTTP result mapping. Shared location types and PSGC resolution are used by both reports and sites; the existing Customer report HTTP and database JSON contracts are preserved.

Migration `20261027100002_SupplySiteManagement` adds the `supply_sites` table with a JSONB resolved address and a non-unique `(name, id)` index for ordered listing. It does not change the report schema. API startup does not apply migrations. After configuring the connection string and restoring the pinned EF tool, apply committed migrations explicitly from the repository root:

```sh
dotnet tool restore
dotnet ef database update --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api
```

## Deferred

- Web or mobile site management screens.
- Supplier organization ownership, site deletion or archiving, and site-to-report/service-area relationships.
- Supply status monitoring, site maps, weather warnings, geocoding, or deriving coordinates from an address.

## Verification

The solution build passed with 0 warnings and errors, C# formatting passed, and EF reported no pending model changes. The PostgreSQL integration suite passed 29/29 tests, including all seven Supply Site tests; it applied the migration to its dedicated test database. Link checks for the updated documentation and validation of all 19 canonical PSGC JSON files and 18 region references also passed. Apply the migration explicitly to each local database before startup as shown above; the development database was not migrated during this verification.
