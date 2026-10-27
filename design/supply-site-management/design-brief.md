# Aqours Supply Site Management — design review brief

## Latest user revision — takes precedence over the original brief

Users must see addresses or map locations only. Remove all visible latitude/longitude values, coordinate inputs, numeric coordinate columns, bounds, precision information, and technical coordinate labels from every screen. The directory shows addresses; Add/Edit use a map pin to select the required location, Details uses a read-only location map and address, and validation uses a single plain-language location error.

The API still requires latitude and longitude internally; a future map picker supplies them without showing the numbers. The address and selected map location remain independent, with no geocoding or inferred coordinate claims. This map UI is a design-only proposal authorized by the user after the original generation; the spec's existing deferred-map scope and original manual-coordinate UI below are preserved as source history, not the current design direction. No application implementation is authorized.

See `map-revision-request.json` for the exact revision sent to Stitch.

Generate design proposals only inside the EXISTING Aqours supplier WEB Stitch project 5821335657238034680. Preserve its current screens; add this feature's screens. Reuse design system assets/19401ab19fd7432bbcc42f76bbeb75da. No application implementation, React components, API integration, deployment, or new Stitch project.

## Product and existing UI

Aqours is a Philippine water reporting and supplier response system for a one-week MVP. Customer mobile is separate; this is the cookie-authenticated supplier Admin web portal. Admin Elena Cruz manages records. Current web portal already has Dashboard, Reports and Accounts. Add Admin-only "Supply sites" between Reports and Accounts, selected on these proposals. Do not show feature entry for Staff/Customer.
Use the existing framed-sheet style: pale water-tinted #F4F7F6 L-shaped ground; labelled 232px viewport-bound sidebar (collapsible to 64px), 56px top navbar; white inset work sheet; #E8EAEC hairlines; 8px panels and 6px controls; 24px canvas padding, 16px gaps. Sidebar and content scroll independently. IBM Plex Sans, 24px headings, 14px body, 12px metadata. Aqours' outline droplet with small curved highlight, #1B6C80 brand accent, #1D1F20 primary buttons, #131416 ink, #5D5F60 secondary, #A51D25 error, #195B38 success. Feather-style outline icons. Existing web screens 08 Admin account list and 09 Admin create account are visual references.
Keep chrome quiet, active nav neutral, white controls with visible borders and keyboard focus. No KPI tile row, chart, gradient, heavy shadows, unrelated toolbar/search/filter actions, stock photography or decorative illustrations. This is site record administration.
At 1440x900 the page purpose, primary action and all form-section headings/first fields must appear. On tablet collapse navigation, on narrow web screens provide accessible menu and stacked fields/rows. This is responsive web, not a Customer mobile feature.

## Feature scope / exact UX constraints

The only supported operations are paginated list, individual detail, create, and full update.
List order is FIXED name then ID. There is NO server-side search/filter/custom sort; do not draw search, filters, sort selectors, export, import, bulk selection, delete, archive, status toggles, organization switcher, map, map pin, GPS, geocoding, service area/report linkage, sensors, supply status, weather or warning controls.
Use an explicit "Add supply site" primary action, linked names or View details, and Edit site. Pagination includes range/total, previous/next and page-size control with 20 default and valid choices <=100. Small sample shows 6 sites, all on page 1, range "1–6 of 6", previous/next disabled. Names may duplicate; never mark duplicates as errors.
Record fields: GUID ID; required trimmed name <=200 chars; required address with cascading Region -> Province where applicable -> City/municipality -> Sub-municipality where applicable -> Barangay; required street/landmark details <=500 chars; required independent numeric latitude [-90,90] and longitude [-180,180]. Preserve PSGC codes as strings; labels show canonical names. Changing an ancestor clears descendants. Province is not applicable for NCR; sub-municipality only where the hierarchy has it. Explain optional/not-applicable fields clearly without pretending all regions require a province.
Manual coordinates only; helper says "Enter the site's coordinates. The address does not set or verify these values." No maps or auto-address-coordinate claims. Readonly detail shows canonical complete address and latitude/longitude with consistent precision, GUID, creation/update dates; timestamps stored UTC, shown as clearly labelled Asia/Manila.
Create: empty name and street/landmark required; show illustrative selected address path if useful. Save once through "Create supply site"; Cancel returns to list. On success use confirmation notice "Supply site created" and open detail.
Edit: load ALL fields, "Save changes", Cancel returns detail; save is complete replacement including unchanged fields, record ID/createdAt immutable; no inline autosave, version history, audit author, conflict dialog or optimistic-lock claims. Last successful write wins. Preserve draft on recoverable errors. Dirty cancel should confirm discarding local edits.
400 errors displayed inline at exact field with short top summary/focus link; missing/invalid CSRF or session expiry uses helpful retry/sign-in message without exposing internal token terminology. 401 sign-in, 403 access denied, 404 site unavailable; load/submit error uses Retry without erasing fields, no duplicate create on repeated click, saving disabled with progress. First-run empty is "No supply sites yet" with Add supply site. Failed load must never look like zero records.
Sample data is FICTIONAL review data only, never connected/sensor/live proof. Scope label "Design preview · Sample records" unobtrusive.

## Canonical sample fixtures

Use address from the actual spec: Region I (Ilocos Region) 0100000000; Ilocos Norte 0102800000; Adams 0102801000; Barangay Adams 0102801001; sub-municipality not applicable. Coordinates 18.466300, 120.903100. Street/landmark "Near the old bridge".
Six records sorted by name: Adams Pump Station; East Distribution Tank; Hillside Supply Station; North Reservoir; Riverside Storage; West Service Tank. All use this same valid Adams administrative path with different fictional street/landmark labels. No implied service areas.
Selected site North Reservoir, ID b561e448-49d0-4f4a-ab82-7d074f8c61e7. Created 27 Oct 2026 16:30 PHT, updated 27 Oct 2026 17:15 PHT (API UTC 08:30 and 09:15 respectively). North Reservoir has the exact fixture coordinates/address above. Illustrative records only.

## Screen set requested

Create SIX separate cohesive DESKTOP design screens, not a collage of states:

1. "Supply sites — Directory": Which sites are recorded? Six-row name-ordered directory with name, canonical address compactly, coordinates, updated time, View details; Add supply site; honest paging.
2. "Supply sites — Add site": How do I record a site? Complete named form with Site details, Philippine address and Coordinates sections, required labels, optional hierarchy behavior, limits/helper text, Create supply site and Cancel.
3. "Supply sites — Site details": What is recorded for North Reservoir? Full readonly record with Edit site, Back to supply sites, full address, coordinates and record timestamps/ID. No map.
4. "Supply sites — Edit site": How do I correct this record? All prefilled fields, North Reservoir with street details changed to "Near the old bridge, east gate", Save changes/Cancel; small unsaved-changes cue.
5. "Supply sites — Validation": What must I correct? Same add form after failed submission; missing name, missing street/landmark details, invalid latitude 95.500000 with exact range text; valid longitude retained; summary with links, no toast-only errors.
6. "Supply sites — Empty directory": What should an Admin do first? Same list shell and headers, 0 sites, plain first-run empty message and Add supply site action. No illustration, no invented stats.

## Source spec (verbatim)

# Supply Site Management API

## Status and scope

The API provides Admin-only create, list, read, and full-update operations for supplier supply-site records. It is API support for the MVP's site management workflow; this feature does not add a web or mobile management screen.

Supplier sites have a persistent GUID, trimmed name, resolved Philippine address, latitude and longitude, and UTC creation and update timestamps. Names are limited to 200 characters. Duplicate names are allowed. The complete address is selected from canonical PSGC codes and includes required trimmed street or landmark details up to 500 characters. The API resolves and snapshots canonical administrative names. Latitude and longitude must be finite numbers in the inclusive ranges -90 to 90 and -180 to 180. Coordinates are submitted independently: the API does not infer them from an address or check that they fall within the selected administrative area.

## HTTP contract

All routes use the cookie-authenticated Admin policy, which requires a fully onboarded Admin web session. Anonymous requests and Customer bearer sessions receive `401`; Staff web sessions and password-change-restricted Admin sessions receive `403`. JSON uses camelCase and responses are not cacheable under the existing API policy.

| Method and route                                              | Request                                                     | Result                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/admin/supply-sites?page={page}&pageSize={pageSize}` | Optional query values; defaults are page `1`, pageSize `20` | `200` page response                                              |
| `GET /api/admin/supply-sites/{id}`                            | GUID                                                        | `200` site response or `404`                                     |
| `POST /api/admin/supply-sites`                                | Complete site body                                          | `201` site response and `Location: /api/admin/supply-sites/{id}` |
| `PUT /api/admin/supply-sites/{id}`                            | Complete replacement site body                              | `200` updated response or `404`                                  |

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

## Implemented endpoint DTOs and application validation (verbatim)

```csharp
using System.Globalization;
using Aqours.Api.Features.Accounts;
using Aqours.Api.Locations;
using Aqours.Application.Features.SupplySites;
using Aqours.Domain.Features.SupplySites;

namespace Aqours.Api.Features.SupplySites;

public sealed record SaveSupplySiteRequest(string? Name, AddressRequest? Address, double? Latitude, double? Longitude)
{
    public SaveSupplySite ToInput() => new(Name, Address is null ? null :
        new(Address.RegionCode, Address.ProvinceCode, Address.CityMunicipalityCode, Address.SubMunicipalityCode,
            Address.BarangayCode, Address.Details), Latitude, Longitude);
}

public sealed record SupplySiteResponse(Guid Id, string Name, AddressResponse Address, double Latitude, double Longitude,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt)
{
    public static SupplySiteResponse From(SupplySite site)
    {
        var a = site.Address;
        return new(site.Id, site.Name, new(a.RegionCode, a.RegionName, a.ProvinceCode, a.ProvinceName,
            a.CityMunicipalityCode, a.CityMunicipalityName, a.SubMunicipalityCode, a.SubMunicipalityName,
            a.BarangayCode, a.BarangayName, a.Details), site.Latitude, site.Longitude, site.CreatedAt, site.UpdatedAt);
    }
}

public sealed record SupplySitePageResponse(IReadOnlyList<SupplySiteResponse> Items, int Page, int PageSize, int TotalCount);

public static class SupplySiteEndpoints
{
    public static void MapSupplySiteEndpoints(this WebApplication app)
    {
        var sites = app.MapGroup("/api/admin/supply-sites").RequireAuthorization("Admin");
        sites.MapGet("", async (SupplySiteService service, CancellationToken cancellationToken, string? page = null, string? pageSize = null) =>
        {
            var errors = new Dictionary<string, string[]>();
            var pageNumber = ParsePagination(page, 1, "page", errors);
            var size = ParsePagination(pageSize, 20, "pageSize", errors);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var result = await service.ListAsync(pageNumber, size, cancellationToken);
            if (!result.Succeeded) return Results.ValidationProblem(result.Errors!);
            var value = result.Value!;
            return Results.Ok(new SupplySitePageResponse(value.Items.Select(SupplySiteResponse.From).ToList(), value.Page, value.PageSize, value.TotalCount));
        });
        sites.MapGet("/{id:guid}", async (Guid id, SupplySiteService service, CancellationToken cancellationToken) =>
        {
            var site = await service.FindAsync(id, cancellationToken);
            return site is null ? Results.NotFound() : Results.Ok(SupplySiteResponse.From(site));
        });
        sites.MapPost("", async (SaveSupplySiteRequest request, SupplySiteService service, CancellationToken cancellationToken) =>
        {
            var result = await service.CreateAsync(request.ToInput(), cancellationToken);
            return result.Site is { } site ? Results.Created($"/api/admin/supply-sites/{site.Id}", SupplySiteResponse.From(site)) :
                Results.ValidationProblem(result.Errors!);
        }).AddEndpointFilter<CsrfFilter>();
        sites.MapPut("/{id:guid}", async (Guid id, SaveSupplySiteRequest request, SupplySiteService service, CancellationToken cancellationToken) =>
        {
            var result = await service.UpdateAsync(id, request.ToInput(), cancellationToken);
            if (result.Errors is not null) return Results.ValidationProblem(result.Errors);
            return result.Site is { } site ? Results.Ok(SupplySiteResponse.From(site)) : Results.NotFound();
        }).AddEndpointFilter<CsrfFilter>();
    }

    private static int ParsePagination(string? value, int fallback, string field, Dictionary<string, string[]> errors)
    {
        if (value is null) return fallback;
        if (int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number)) return number;
        errors[field] = ["Enter a valid integer."];
        return fallback;
    }
}
using Aqours.Application.Features.Accounts;
using Aqours.Application.Locations;
using Aqours.Domain.Features.SupplySites;
using Aqours.Domain.Locations;

namespace Aqours.Application.Features.SupplySites;

public sealed record SaveSupplySite(string? Name, AddressInput? Address, double? Latitude, double? Longitude);
public sealed record SupplySitePage(IReadOnlyList<SupplySite> Items, int Page, int PageSize, int TotalCount);
public sealed record SupplySiteSaveResult(SupplySite? Site = null, Dictionary<string, string[]>? Errors = null);

public interface ISupplySiteStore
{
    Task AddAsync(SupplySite site, CancellationToken cancellationToken);
    Task<SupplySite?> FindAsync(Guid id, CancellationToken cancellationToken);
    Task UpdateAsync(SupplySite site, CancellationToken cancellationToken);
    Task<SupplySitePage> ListAsync(int page, int pageSize, CancellationToken cancellationToken);
}

public sealed class SupplySiteService(ISupplySiteStore store, IPsgcAddresses addresses, TimeProvider clock)
{
    public Task<SupplySite?> FindAsync(Guid id, CancellationToken cancellationToken = default) =>
        store.FindAsync(id, cancellationToken);

    public async Task<Outcome<SupplySitePage>> ListAsync(int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var errors = new Dictionary<string, string[]>();
        if (page < 1) errors["page"] = ["Page must be positive."];
        if (pageSize is < 1 or > 100) errors["pageSize"] = ["Page size must be between 1 and 100."];
        if (errors.Count > 0) return new(null, errors);
        return new(await store.ListAsync(page, pageSize, cancellationToken));
    }

    public async Task<SupplySiteSaveResult> CreateAsync(SaveSupplySite input, CancellationToken cancellationToken = default)
    {
        var resolved = Validate(input);
        if (!resolved.Succeeded) return new(Errors: resolved.Errors);
        var site = new SupplySite(input.Name!, resolved.Value!, input.Latitude!.Value, input.Longitude!.Value, clock.GetUtcNow());
        await store.AddAsync(site, cancellationToken);
        return new(site);
    }

    public async Task<SupplySiteSaveResult> UpdateAsync(Guid id, SaveSupplySite input, CancellationToken cancellationToken = default)
    {
        var site = await store.FindAsync(id, cancellationToken);
        if (site is null) return new();
        var resolved = Validate(input);
        if (!resolved.Succeeded) return new(Errors: resolved.Errors);
        site.Replace(input.Name!, resolved.Value!, input.Latitude!.Value, input.Longitude!.Value, clock.GetUtcNow());
        await store.UpdateAsync(site, cancellationToken);
        return new(site);
    }

    private Outcome<PsgcAddress> Validate(SaveSupplySite input)
    {
        var errors = new Dictionary<string, string[]>();
        var name = input.Name?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > SupplySite.MaxNameLength)
            errors["name"] = ["Name is required (up to 200 characters)."];
        if (input.Latitude is not { } latitude || !Coordinates.ValidLatitude(latitude))
            errors["latitude"] = ["Latitude is required and must be a finite number between -90 and 90."];
        if (input.Longitude is not { } longitude || !Coordinates.ValidLongitude(longitude))
            errors["longitude"] = ["Longitude is required and must be a finite number between -180 and 180."];
        PsgcAddress? address = null;
        if (input.Address is null) errors["address"] = ["Address is required."];
        else
        {
            var resolved = addresses.Resolve(input.Address);
            address = resolved.Value;
            if (resolved.Errors is not null)
                foreach (var error in resolved.Errors) errors[error.Key] = error.Value;
        }
        return errors.Count > 0 ? new(null, errors) : new(address);
    }
}

```
