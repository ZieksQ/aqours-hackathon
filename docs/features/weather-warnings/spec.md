# Weather Warnings API

## Status and scope

The API provides supplier personnel with site-level forecasts and potential supply-risk assessments. Admins configure one organization-wide demo heat threshold. The supplier portal implements weather monitoring and a dedicated site weather map. Customers can read the same site forecasts and assessments through the mobile view. Automated weather alert delivery, service-area association, water-depletion prediction, and warning overlays on the separate operational `/map` screen remain deferred.

The forecast is retrieved from Open-Meteo's free forecast API for each site's coordinates. The API returns three Philippine-local forecast dates (today and the next two days), daily maximum temperatures in Celsius, the manual supply reading, and a per-day assessment. A potential supply-risk warning means only that forecast maximum temperature strictly exceeds the configured threshold while the latest manual supply status is `Low`. The threshold is a demo setting, not an official safety level. An `Unavailable` reading remains visible and is not treated as `Low`.

## HTTP contract

All routes return camelCase JSON and use non-cacheable response headers.

| Method and route | Access | Result |
| --- | --- | --- |
| `GET /api/staff/weather/settings` | Fully onboarded Admin or Staff personnel cookie session | `200` threshold settings |
| `PUT /api/admin/weather/settings` | Fully onboarded Admin cookie session and CSRF token | `200` updated settings or `400` field validation problem |
| `GET /api/staff/supply-sites/{id}/weather` | Fully onboarded Admin or Staff personnel cookie session | `200` site weather or `404` unknown site |
| `GET /api/staff/weather/sites?page={page}&pageSize={pageSize}` | Fully onboarded Admin or Staff personnel cookie session | `200` paginated weather assessments |
| `GET /api/customer/weather/sites?page={page}&pageSize={pageSize}` | Fully onboarded Customer bearer session | `200` paginated site weather assessments |

Anonymous and Customer bearer requests receive `401`; role or onboarding restrictions receive `403`. Reads require the `Personnel` policy. The settings write requires Admin and `X-CSRF-TOKEN`; missing or invalid CSRF returns `400`. Admin cannot update settings through the Staff settings route.

The threshold is initialized to `35` °C. Before the first Admin update, `updatedAt` is `null`; later updates return its UTC timestamp. The update body is `{ "heatThresholdCelsius": 35 }`. The value must be a finite JSON number from 0 through 60 inclusive. Missing, null, non-numeric, non-finite, and out-of-range values return `400` with a field-keyed error under `heatThresholdCelsius`; invalid updates do not change the setting.

List pagination defaults to page `1` and pageSize `20`; page must be positive and pageSize must be 1 through 100. Invalid values return field-keyed `400` validation problems. The site ordering is stable by name and then ID. The response shape is `{ items, page, pageSize, totalCount }`; an out-of-range page has an empty `items` array and retains the requested pagination metadata.

Each weather site response includes:

- `id`, `name`, `latitude`, and `longitude` from the existing site record.
- `heatThresholdCelsius` used for assessment.
- `latestSupplyStatus` and `latestSupplyAt`, nullable when no manual reading exists.
- `supplyMissing` and `supplyStale`; supply is stale only when its latest reading is more than 24 hours old. A stale reading still participates in the warning rule and is explicitly identified as potentially outdated.
- `forecastRetrievedAt`, `forecastRetryAfter`, `forecastMissing`, `forecastIncomplete`, `forecastStale`, and `isProvisional`.
- `provider` attribution metadata, `days`, `limitations`, and `recommendedActions`.

Each of the three `days` has `date`, nullable `maximumTemperatureCelsius`, and `warningState`, one of `Unknown`, `NoWarning`, or `PotentialSupplyRisk`. Dates represent Asia/Manila local calendar days. A missing temperature or missing supply reading yields `Unknown`; otherwise the strict combined rule determines `PotentialSupplyRisk` or `NoWarning`. Missing or partial provider data does not imply that no risk exists. Forecasts at least one hour old are marked stale and provisional; available old values remain visible and continue to be assessed. Provider failure retains the previously saved forecast, sets a retry time five minutes later, and returns any prior values with their stale/provisional indicators. Without a saved forecast, the three dates remain present with null temperatures and `Unknown` assessments.

`recommendedActions` is a deterministic list of `{ code, instruction, reason }` items. The supported stable codes are:

| Code | Instruction | Condition |
| --- | --- | --- |
| `ReviewStockAndReplenishment` | Verify stock, prepare replenishment, and check delivery schedules. | At least one day has a potential supply-risk warning. |
| `RecordFreshSupplyReading` | Record a fresh reading to confirm current conditions. | Supply is missing or its latest reading is over 24 hours old. |
| `VerifyInterruptionAndArrangeSupply` | Verify the interruption and arrange replenishment or alternative supply. | Latest supply status is `Unavailable`. |
| `CommunicateConfirmedServiceChanges` | Confirm service availability and communicate verified changes to affected customers. | Latest supply status is `Unavailable`. |
| `VerifyConditionsWithoutFreshForecast` | Check manual supply conditions; the weather assessment is incomplete. | Forecast is stale, missing, or incomplete. |

The API does not promise a fixed number of actions; only applicable codes are included, in the order shown above. Each item also includes a `reason` explaining the current condition. Clients should branch on `code` and render the supplied instruction and reason rather than infer semantics from wording.

## Forecast refresh and provider behavior

Forecast cache records are persistent and associated with a site ID and the coordinates used for retrieval. A missing cache, coordinate change, forecast age of at least one hour, or Philippine date rollover triggers a refresh on the next read, unless a failure retry window is active. A successful refresh stores the new three-day window and retrieval time. A failed refresh does not erase a successful prior forecast and is retried after five minutes. The provider request uses `daily=temperature_2m_max&forecast_days=3&temperature_unit=celsius&timezone=Asia/Manila` with the site's latitude and longitude. The client validates the returned timezone, Celsius units, and dates, and represents missing daily values explicitly.

Within one API process, a site refresh is coordinated across concurrent requests, provider calls are limited to four concurrent requests globally, and each outbound provider request has a 10-second timeout. The provider returns daily maximum 2 m air temperature for three days in Celsius and the API interprets the date window in Asia/Manila. Each API instance has its own coordination limits; distributed coordination is not provided.

The API response identifies Open-Meteo and includes its attribution. Open-Meteo's free API is for non-commercial use and requires attribution under CC BY 4.0. Its published limits are fewer than 10,000 calls per day, 5,000 per hour, 600 per minute, and 300,000 per month. Review the [official terms](https://open-meteo.com/en/terms) and [pricing and usage information](https://open-meteo.com/en/pricing) before changing deployment or usage. The provider's [forecast API documentation](https://open-meteo.com/en/docs) describes the forecast variables and endpoint.

## Architecture and persistence

Domain owns weather settings, forecast assessment rules, and stable action codes. Application coordinates settings, site readings, cached forecasts, and provider access through use cases and interfaces. Infrastructure implements PostgreSQL persistence and the Open-Meteo HTTP client. API owns the route authorization, CSRF requirement, and explicit transport DTOs. Provider credentials are not required; provider calls remain server-side.

The additive `20261029151904_WeatherWarnings` migration adds `weather_settings` with the singleton ID and threshold constraints, seeds ID `1` with a 35 °C threshold and null `updated_at`, and adds `weather_forecasts` keyed by site with a cascading site foreign key. The forecast table stores the coordinate snapshot, local forecast window date, retrieval/retry timestamps, and serialized daily temperatures. API startup does not apply migrations. With the .NET EF CLI installed, apply it explicitly from the repository root:

```sh
dotnet ef database update --project apps/api/src/Aqours.Infrastructure --startup-project apps/api/src/Aqours.Api
```

Forecast refresh does not run in a background job: reads trigger refresh when required. Changing site coordinates invalidates reuse of the old coordinate-associated cache. Updating supply or the threshold changes the assessment returned on the next read without requiring a new forecast fetch.

## Supplier portal

Admin and Staff use `/weather-monitoring` to review all supplier sites, overlapping monitored/risk/unavailable/data-limited counts, site map markers, three-day forecasts, daily risk counts, and the selected site's assessment timeline. The overview loads every page of the existing personnel list before computing organization-wide counts. Name and assessment filters narrow the site list; the summary and daily counts retain the all-site scope. A site can belong to multiple summary categories.

`/weather-monitoring/{id}` presents the API's daily assessment, latest manual supply evidence, independent forecast and supply timestamps, limitations, retry time, and recommended actions. Missing temperatures remain chart gaps and Unknown assessments. Stale evidence remains visible and explicitly provisional. The timeline uses each forecast date with the latest reading; it does not represent assessment history or predict future supply. Staff can follow the existing supply-monitoring destination to record a reading; Admin remains read-only for supply observations.

Admin alone can edit the organization-wide demo threshold at `/weather-monitoring/settings`. The form accepts finite values from 0 through 60 inclusive and invalidates weather queries after a successful save. API authorization and CSRF remain authoritative. Forecast refresh is still read-triggered and respects the provider retry window; the portal refresh control does not force a provider fetch.

Charts use Recharts with displayed textual forecast values; maps use the existing React Leaflet/Geoapify configuration. Maps provide accessible site selection and retain a site list when tiles are unavailable. Responsive layouts use the existing portal shell and a compact site list on phones. No new migration is required beyond the existing WeatherWarnings migration.

## Deferred

- Warning overlays on the separate operational `/map` screen.
- Weather-triggered Customer push alerts. The mobile app currently receives push for supplier report status changes and replies.
- Background refresh, distributed refresh locks, and live update delivery.
- Site/service-area association, stock depletion estimates, official heat alerts, or El Niño detection.

## Verification

Migration `20261029151904_WeatherWarnings` was applied to the dedicated `aqours_auth_integration_tests` database; the development database was not migrated. EF reported no pending model changes, the final API build passed with zero warnings or errors, C# format verification passed, and the full API suite passed 107/107 tests (41 weather unit tests, 13 weather PostgreSQL endpoint tests, and 53 existing tests). Provider behavior was verified with a fake response; no live forecast request was required.
