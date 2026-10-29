# Manual Supply Monitoring API

## Status and scope

The supplier API and Admin/Staff web interface support manual supply availability readings for existing sites. Admin and Staff can browse the paginated site directory and read site details, latest readings, and reading history through a supplier personnel cookie session. Only Staff can record readings. The customer app’s supplier-site map and supply display, a supplier supply dashboard, and weather warnings remain deferred. Readings are manually entered observations, not live sensor data.

The web interface is available at `/supply-monitoring`. Staff can open a recording dialog and append a status; Admin has read-only access. The directory and history use API pagination, and the UI displays exact Asia/Manila recording times with named attribution. A site with no readings is shown as unrecorded, with an empty history. See the reviewed [Stitch design proposal](../../../design/manual-supply-monitoring/README.md) for the visual references; the design folder is locally ignored.

Each reading has one of three exact statuses: `Normal`, `Low`, or `Unavailable`. Repeating the current status is allowed and creates a new history entry with fresh updater attribution and time. A reading stores the site, status, authenticated Staff account ID, a snapshot of that account’s first and last name joined by one space, and a UTC timestamp. The timestamp comes from `TimeProvider` and is truncated to PostgreSQL microsecond precision; clients cannot backdate readings. Readings are append-only through this API; no edit or delete operation is exposed. A database-generated sequence orders readings, including when timestamps tie, and determines both the latest reading and history order. Concurrent accepted inserts are preserved as separate readings. Site metadata edits do not change supply history, and supply readings do not modify the site's `updatedAt` metadata timestamp.

## HTTP contract

All routes return camelCase JSON and follow the API’s non-cacheable response policy. List and history responses use `{ items, page, pageSize, totalCount }`.

| Method and route                                                                  | Access                                                  | Result                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| `GET /api/staff/supply-sites?page={page}&pageSize={pageSize}`                     | Fully onboarded Admin or Staff personnel cookie session | `200` monitored site page                          |
| `GET /api/staff/supply-sites/{id}`                                                | Fully onboarded Admin or Staff personnel cookie session | `200` monitored site or `404`                      |
| `GET /api/staff/supply-sites/{id}/supply-updates?page={page}&pageSize={pageSize}` | Fully onboarded Admin or Staff personnel cookie session | `200` history page or `404` site                   |
| `POST /api/staff/supply-sites/{id}/supply-updates`                                | Fully onboarded Staff cookie session and CSRF token     | `201` recorded reading, `403` Admin, or `404` site |

Page defaults to `1` and pageSize to `20`; page must be positive and pageSize must be from `1` through `100`. Invalid values return `400` validation problems. An out-of-range page returns an empty `items` list with the requested pagination metadata. The monitored-site list sorts by site name and then site ID. History sorts by descending database sequence, newest first. A known site with no readings has `latestSupply: null`; its history endpoint returns an empty `items` array and `totalCount: 0`. An unknown valid GUID site ID returns `404` from the detail and history endpoints.

The monitored-site response preserves the existing Supply Site Management fields and adds nullable `latestSupply`:

```json
{
  "id": "b561e448-49d0-4f4a-ab82-7d074f8c61e7",
  "name": "North Reservoir",
  "address": { "details": "Near the old bridge" },
  "latitude": 18.4663,
  "longitude": 120.9031,
  "createdAt": "2026-10-27T08:30:00Z",
  "updatedAt": "2026-10-27T08:30:00Z",
  "latestSupply": {
    "id": "71559f07-6893-45b4-8616-ce4eb537eec8",
    "siteId": "b561e448-49d0-4f4a-ab82-7d074f8c61e7",
    "status": "Low",
    "updatedBy": { "id": "staff-account-id", "name": "Jamie Santos" },
    "updatedAt": "2026-10-29T03:15:20.123456Z"
  }
}
```

The `address` above is abbreviated for readability; responses contain the complete existing address contract. Sites with no readings return `"latestSupply": null`. Each history `items` entry has the same shape as `latestSupply`.

POST takes a JSON body with one case-sensitive status value:

```json
{ "status": "Unavailable" }
```

The response body is the created reading, and `Location` points to `/api/staff/supply-sites/{id}/supply-updates`. Any other value, including a non-string, returns `400` with a field-keyed validation error for `status`. Missing or invalid CSRF tokens return `400`. The authenticated account must resolve to a Staff account that has completed required password onboarding; Admin and Customer identities cannot record readings. Reads require the `Personnel` policy; writes additionally require the Staff role. Anonymous requests and Customer bearer sessions receive `401`; restricted personnel sessions and Admin write attempts receive `403`.

## Persistence and architecture

The Domain owns the supply status and reading data. Application coordinates Staff account lookup, validation, and the `ISupplyMonitoringStore` boundary. Infrastructure persists readings and retrieves the latest reading per site by descending database sequence. API owns the explicit response contracts, personnel authorization, Staff-only write rule, and CSRF filter. Existing Admin Supply Site Management response fields and routes remain unchanged.

Migration `20261029071543_ManualSupplyMonitoring` adds only the `supply_updates` table. Its PostgreSQL identity `bigint` sequence and unique `(site_id, sequence DESC)` index support deterministic latest/history queries and preserve concurrent inserts as separate readings. Restrictive foreign keys to the site and updater preserve referenced records while history exists; an updater index supports the account relationship. Timestamp storage uses PostgreSQL `timestamp with time zone` at microsecond precision. Customer reads, client-provided timestamps, reading edits/deletes, realtime notifications, and stale-reading thresholds are outside this API. See the root README for the explicit migration command; API startup does not apply migrations.

## Verification

The generated migration `20261029071543_ManualSupplyMonitoring` was reviewed as an additive `supply_updates` table migration and applied to the dedicated `aqours_auth_integration_tests` database. The solution build passed with zero warnings or errors, EF reported no pending model changes, C# formatter verification passed, and the full test suite passed all 36 tests, including all 7 manual supply monitoring integration tests. The development database was not migrated during verification.
