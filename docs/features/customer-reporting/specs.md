# Customer reporting API

This document describes the implemented API slice for submitting water reports and reading a customer's own reports. Staff queue, ticket, and messaging behavior is implemented separately in the [Staff report workspace spec](../staff-report-workspace/spec.md); this existing contract remains unchanged.

## Access and ownership

All routes require a valid Customer Bearer access token from the mobile authentication API. The token must represent a full session after the required first-login password change. Anonymous requests, invalid tokens, tokens for a non-Customer account, and cookie-only authentication receive `401 Unauthorized`. A valid Customer token from a restricted first-login session receives `403 Forbidden`.

The API derives the report owner from the authenticated token. Clients cannot choose or change the owner. Listing and detail queries are scoped to that owner. A report that does not exist or belongs to another Customer returns the same `404 Not Found` response.

## Submit a report

`POST /api/reports` creates a report and returns `201 Created`. The `Location` header points to `/api/reports/{id}`. New reports have status `Submitted`.

```json
{
  "issueType": "LowPressure",
  "description": "Water is barely flowing.",
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

Validation rules:

- `issueType` must be exactly `NoWater`, `LowPressure`, or `DirtyWater`.
- `description` is required, trimmed before storage and response, and limited to 2,000 characters after trimming.
- `address.details` is required, trimmed before storage and response, and limited to 500 characters after trimming.
- `latitude` and `longitude` are required finite numbers in the inclusive ranges `-90..90` and `-180..180`.
- Address codes are PSGC codes encoded as strings, preserving leading zeroes. `regionCode`, `cityMunicipalityCode`, and `barangayCode` are required. `provinceCode` and `subMunicipalityCode` are nullable only when that administrative level does not exist on the selected barangay's actual ancestor path.
- The API resolves the submitted codes against the canonical dataset in `packages/psgc/data`. Every provided code must have the expected geographic level and be the actual ancestor of the selected barangay; all intermediate levels must be supplied. Submitted names are ignored. The response contains names resolved from the dataset at submission time.

Field-level input errors return a validation problem response (`400 Bad Request`). The response identifies invalid fields, including nested address fields such as `address.barangayCode`. Malformed JSON, body-binding errors (for example, a numeric `issueType`), and invalid query parameter syntax also return `400 Bad Request`.

Successful response example (names depend on the selected PSGC location):

```json
{
  "id": "b561e448-49d0-4f4a-ab82-7d074f8c61e7",
  "issueType": "LowPressure",
  "description": "Water is barely flowing.",
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
  "status": "Submitted",
  "createdAt": "2026-10-25T08:30:00+00:00"
}
```

`createdAt` is UTC. The response does not expose the Customer identifier or persistence entity.

## List the current customer's reports

`GET /api/reports?page={page}&pageSize={pageSize}` returns only reports owned by the authenticated Customer. Both query parameters are optional: `page` defaults to `1`, and `pageSize` defaults to `20`. Both must be positive integers; `pageSize` is capped at `100`. Invalid, empty, malformed, or out-of-range values return `400 Bad Request` as a validation problem.

Items are ordered by `createdAt` descending, with report ID descending as a deterministic tie-breaker. An out-of-range page returns an empty `items` array and the same total count.

```json
{
  "items": [
    {
      "id": "b561e448-49d0-4f4a-ab82-7d074f8c61e7",
      "issueType": "LowPressure",
      "description": "Water is barely flowing.",
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
      "status": "Submitted",
      "createdAt": "2026-10-25T08:30:00+00:00"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "totalCount": 1
}
```

Each `items` element has the same shape as the successful submit response.

## Read one report

`GET /api/reports/{id}` returns the same report shape as submission for an owned report. A missing report and a report belonging to another Customer both return `404 Not Found`.

## Status and persistence scope

The domain recognizes `Submitted`, `InProgress`, and `Resolved`. This API slice only creates reports as `Submitted`; no endpoint here changes status or manages staff assignment, responses, or resolution.

The `CustomerReports` EF migration adds the reports table. It stores the resolved address and its PSGC names together as a JSONB snapshot, restricts deletion of a Customer with reports, and adds an index for customer-scoped newest-first pagination. API startup does not apply migrations or modify schema.

Apply migrations explicitly from the repository root after configuring the API database connection:

```sh
dotnet tool restore
dotnet ef database update --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api
```

Infrastructure links the canonical PSGC JSON from `packages/psgc/data` and copies it to both build and publish output under `psgc/`. The API loads that deployed content; runtime resolution does not depend on the repository checkout path.

## Verification

The reporting integration coverage exercises customer submission and persistence, resolved PSGC names, listing and detail retrieval, owner isolation, Bearer/full-session authorization, input validation and trimming, inclusive coordinate boundaries, page-size limits, sort tie-breaking, and the `CustomerReports` database schema. See the repository progress record for the checks actually completed for this feature.

## Out of scope

This API slice does not provide the customer mobile UI, location picking, report maps, report editing, or report deletion. Staff queues, claims, responses, status changes, and customer messaging are implemented separately in the [Staff report workspace spec](../staff-report-workspace/spec.md).
