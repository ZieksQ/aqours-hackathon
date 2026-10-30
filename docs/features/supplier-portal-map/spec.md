# Supplier Portal Map

## WHAT

Admin and Staff use `/map` to locate supplier sites and customer water reports, inspect their current state, and open the existing supply history or ticket workspace. The map starts with sites and unresolved reports. Access covers the supplier organization's full site and report set, matching the shared report queue; no service-area restriction is introduced.

This is a read-only supplier workflow. Customer supplier-site maps, weather warnings, live map subscriptions, clustering, location editing, and report mutations remain deferred. Supply values are manual observations with recording times, rather than live sensor readings.

## MUST

### Access and privacy

- Both map endpoints require the existing `Personnel` policy: an authenticated Admin or Staff cookie session with required password onboarding complete. Anonymous requests and Customer bearer sessions receive `401`; restricted Admin/Staff sessions receive `403`. Customers cannot access report or site map data through these routes.
- The map uses dedicated summaries. Report responses exclude customer IDs, customer contact details, descriptions, messages, and conversations. Handler identity contains only ID and display name. Site summaries exclude updater identity and reading history.
- API authorization remains authoritative; the portal route and navigation follow the existing session and password-change guards.

### Layers and interactions

- Show sites and unresolved reports initially. Provide separate site/report layer toggles, report status and priority filters, Refresh, and Fit locations.
- Load every page of a layer before publishing its result. Failed page loads expose Retry for that layer. A failed refresh can retain the last complete layer with a stale-data notice; partial pages must not appear to be complete coverage.
- Use these marker encodings, with text labels in the legend and details:

| Object or state                     | Marker                                            |
| ----------------------------------- | ------------------------------------------------- |
| Supply site                         | Blue `FiHome`                                     |
| No water report                     | `FiDroplet`                                       |
| Low pressure report                 | `FiTrendingDown`                                  |
| Dirty water report                  | `FiFilter`                                        |
| Low / Normal / High report priority | Gray / amber / red report pin                     |
| Submitted report                    | Additional blue `FiAlertCircle` exclamation badge |

- Claiming changes Submitted to InProgress, removing the exclamation badge on the next refresh while preserving the issue icon and priority color. The badge indicates an unclaimed report; it does not indicate a weather warning.
- Report popups show issue, priority, status, handler or “Unassigned,” address, and a link to `/reports/{id}`. Site popups show name, address, latest manual status/time or “No reading,” and a link to `/supply-monitoring/{id}`.
- Keep a synchronized, keyboard-accessible location list. Each location has its own entry even when coordinates overlap, and markers have accessible names. Selecting an entry identifies its corresponding marker and details.
- Fit loaded locations initially, capped at zoom 14 for a single location. Refresh preserves the user's pan and zoom. Fit locations explicitly refits the currently visible locations. An empty initial map uses the Philippines view and an explicit empty state.
- Keep loading, empty layers, API failures, missing tile configuration, and failed tiles distinct. Tile failure must leave the location list usable and offer a tile retry.
- Refresh through the Refresh action and on window focus. The map does not subscribe to live report events in this MVP.

## HOW

### HTTP contracts

All responses use camelCase JSON and the API's existing `Cache-Control: no-store` policy. The endpoints perform no writes and require no CSRF token.

| Method and route                                                  | Result              |
| ----------------------------------------------------------------- | ------------------- |
| `GET /api/staff/map/sites?page=1&pageSize=20`                     | Site summary page   |
| `GET /api/staff/map/reports?status=unresolved&page=1&pageSize=20` | Report summary page |

Both responses have `{ items, page, pageSize, totalCount }`. Defaults are page `1` and pageSize `20`; page must be positive, and pageSize must be `1` through `100`. Malformed or invalid values return `400` validation problems keyed by `page` or `pageSize`. Out-of-range pages return an empty `items` array with the requested pagination metadata. The client requests pages of `100` and retains one complete result per layer/filter query.

Report `status` accepts exactly `unresolved`, `all`, `Submitted`, `InProgress`, or `Resolved`; omission defaults to `unresolved`. `unresolved` includes Submitted and InProgress; `all` includes all three statuses. Other values return a `400` validation problem keyed by `status`. The priority filter applies locally to the fully loaded report layer; it is not an endpoint query parameter.

Sites sort by name ascending, then ID ascending. Reports sort by creation time descending, then ID descending. ID tie-breakers keep pagination deterministic for unchanged data. Pages are independent reads, rather than a transactionally fixed snapshot across requests.

Each site item contains:

```json
{
  "id": "b561e448-49d0-4f4a-ab82-7d074f8c61e7",
  "name": "North Reservoir",
  "address": { "details": "Near the old bridge" },
  "latitude": 18.4663,
  "longitude": 120.9031,
  "latestSupplyStatus": "Low",
  "latestSupplyAt": "2026-10-29T03:15:20.123456Z"
}
```

`latestSupplyStatus` is `Normal`, `Low`, or `Unavailable`; it and `latestSupplyAt` are both null when there is no reading. The latest reading is determined by descending database sequence, including when timestamps tie, consistently with manual supply history.

Each report item contains:

```json
{
  "id": "a7d3b120-6b79-4bd8-960a-f53a4ea7b011",
  "issueType": "NoWater",
  "address": { "details": "Near the old bridge" },
  "latitude": 18.4663,
  "longitude": 120.9031,
  "priority": "High",
  "status": "InProgress",
  "createdAt": "2026-10-29T02:10:00Z",
  "handlerId": "staff-account-id",
  "handlerName": "Jamie Santos"
}
```

`issueType` is `NoWater`, `LowPressure`, or `DirtyWater`; priority is `Low`, `Normal`, or `High`; status is `Submitted`, `InProgress`, or `Resolved`. Unassigned reports have null `handlerId` and `handlerName`. Creation and supply timestamps are UTC instants; the portal formats them in Philippine local time.

The sample addresses above are abbreviated. Each actual `address` contains `regionCode`, `regionName`, nullable `provinceCode` and `provinceName`, `cityMunicipalityCode`, `cityMunicipalityName`, nullable `subMunicipalityCode` and `subMunicipalityName`, `barangayCode`, `barangayName`, and `details`, reusing existing stored PSGC snapshots.

### Architecture and rendering

Application owns `SupplierMapService`, validation, read records, and `ISupplierMapStore`. Infrastructure implements no-tracking PostgreSQL projections over the existing sites, supply updates, reports, and account tables, selecting only the map fields and left-joining handler display names. API endpoints apply `Personnel`, bind pagination/status, and map read records to explicit transport DTOs. No schema change or new migration is required.

The React feature lives in `apps/web/src/features/map`; shared portal controls and navigation come from the public `@aqours/ui` exports. TanStack Query owns layer loading and focus/manual refresh. React Leaflet and Geoapify render the map, with Feather icons rendered into Leaflet [`divIcon` markers](https://leafletjs.com/reference.html#divicon). Configure `VITE_GEOAPIFY_API_KEY` in `apps/web/.env.local`, restrict the browser-visible key to permitted origins, and restart Vite after changes. The list remains available when configuration or tile requests fail.

Desktop presents a map and independently scrolling location list side by side. Tablet and phone layouts stack them; phone filter and legend disclosures start collapsed, with explicit controls to reveal their contents. Header actions remain reachable at narrow widths, and location details/links remain in the list even when tiles cannot render.

Google Stitch visual references and original exports are stored locally in ignored `design/supplier-portal-map/`; its README records the project/screens, artifact inventory, and implementation adaptations.

### Verification

The PostgreSQL integration coverage must verify Admin/Staff reads, Customer and anonymous denial, required-password restrictions, exact response privacy, all status filters, pagination validation and limits, ID tie-break ordering, handler mapping, and sites with no/latest readings. Browser coverage must exercise marker encodings and Submitted badges, filters/layers, popups and detail links, overlaps, keyboard selection, refresh, and independent API/tile/empty states at desktop, tablet, and phone widths. Run the solution build/tests and C# formatting, shared/web type checks, production build, ESLint, and changed-file formatting; record actual results and limitations in `docs/PROGRESS.md`.

The API solution build passed with zero warnings/errors, all changed C# source/tests passed formatter verification, and all 53 PostgreSQL integration cases passed, including 17 supplier-map cases and 36 existing cases. Verification reused the dedicated test database and added no schema migration.

Shared/web type checks, the production web build, shared/web ESLint, changed-file Prettier, and design source lint passed. The production build retains Vite's existing warning for a bundle chunk larger than 500 kB.

Fixture-backed browser checks passed at 1440, 768, and 390px, covering both roles, marker encodings, Submitted badge removal after claim/refresh, layer/status/priority controls, overlapping-location keyboard selection, named focusable markers/map region, detail links, manual/focus refresh, Fit and pan/zoom preservation, atomic loading of 101 sites across pages, failed second-page retry, independent API failures, empty layers, tile failure/retry, and usable lists with missing tile configuration. App inspection reported zero failures/warnings at all three widths; evidence is local under `.taste-skill/supplier-map/qa/`. Browser verification uses synthetic API/tile fixtures; live-backend UI behavior and real Geoapify cartography remain unverified.
