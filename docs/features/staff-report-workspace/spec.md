# Staff report queue and ticket workspace

## Scope and status

This implemented feature provides the supplier web workspace and API for Admin and Staff to review reports, and for assigned Staff to manage an individual report. It extends the existing Customer reporting API without changing its submission, customer-owned list, or detail contracts. Customer messaging endpoints are included; the customer mobile UI remains deferred.

The workflow is intentionally small: reports begin `Submitted`, one Staff member atomically claims a report and moves it to `InProgress`, the assigned Staff member can exchange messages and set priority, then resolve it. There is no manual reassignment or reopening.

## Roles and permissions

- A fully onboarded Admin or Staff web session may list and read every report, including its customer-provided location, and may read the shared conversation history.
- Only Staff may claim a report. A successful claim assigns it to the requesting Staff member.
- Only the Staff member assigned to a report may change its priority, resolve it, or add messages. Admin remains read-only for report operations.
- A fully onboarded Customer JWT may read and add messages only on that Customer's own reports through `/api/reports/{id}/messages`. A missing report and another Customer's report have the same `404` behavior.
- All writes authenticated by the web session require ASP.NET Core antiforgery validation, using the configured request token header and antiforgery cookie. Bearer-authenticated Customer requests use JWT and ownership checks, not browser CSRF.
- Existing authentication behavior applies: unauthenticated requests return `401`; authenticated callers lacking role, full-session status, assignment, or ownership return `403` or the ownership-hiding `404` described above. Responses use explicit DTOs and never expose persistence entities.

The API remains the authority for permissions and state. UI controls may reflect permissions, but do not replace server enforcement.

## Report state and rules

Statuses are `Submitted`, `InProgress`, and `Resolved` (JSON enum spelling as shown). Allowed transitions are:

```text
Submitted --claim by Staff--> InProgress --resolve by assigned Staff--> Resolved
```

- Claim is atomic. Concurrent claims of one `Submitted` report result in exactly one success; the other caller receives `409 Conflict` and cannot become handler.
- A claim stores the handler Staff account ID and UTC claim time. Claim cannot be repeated, including by the current handler.
- Only the assigned Staff member can write to the ticket. Admin and other Staff cannot edit it.
- Resolution is allowed only from `InProgress` and only by the assigned Staff member. A caller who is not the assigned handler (including when the report is unclaimed) receives `403 Forbidden`. Repeating resolution as the assigned Staff member returns `409 Conflict`.
- The status endpoint accepts only `Resolved`; any other or invalid status value returns `400 Bad Request`. The contract provides no transition away from `Resolved`.
- No endpoint accepts an assignee ID. Reports cannot be reassigned or reopened.
- Priority is `Low`, `Normal`, or `High`; new reports default to `Normal`. Only assigned Staff may change priority. Setting the current value may be treated as an idempotent success.
- Message bodies are plain text, trimmed before storage and response, and must contain 1–2,000 characters after trimming. Empty or overlong messages return a validation problem (`400`). Messages may be appended only while a report is `InProgress`; attempts on other statuses return `409 Conflict`. Messages are append-only; there is no edit/delete operation.
- All timestamps are UTC. Each message identifies its sender by account ID, safe display name, and role, not an internal persistence object. Customer messages are visible to authorized Admin/Staff readers; staff messages are visible to the report's Customer.

## Staff REST API

All routes below are under `/api/staff/reports` and require an onboarded Admin or Staff web session, except where write permissions further restrict access.

### Queue

`GET /api/staff/reports` supports these optional query parameters:

| Parameter | Values and behavior |
| --- | --- |
| `tab` | `unassigned`, `mine`, `in-progress`, or `all`; defaults to `unassigned`. `mine` means assigned to the current Staff member. `in-progress` includes all reports with that status. `all` includes all statuses and assignments. Admin may read all tabs; `mine` is empty for Admin. |
| `search` | Case-insensitive search over report ID, issue title, Customer name, and resolved address text. Description is not searched. Whitespace-only input behaves as absent; values longer than 200 characters return `400`. |
| `status` | Optional exact status filter: `Submitted`, `InProgress`, or `Resolved`. |
| `priority` | Optional exact priority filter: `Low`, `Normal`, or `High`. |
| `assignment` | Optional exact assignment filter: `unassigned`, `mine`, or `assigned` (assigned to any Staff member). |
| `page` | Positive 1-based page; defaults to `1`. |
| `pageSize` | Integer from `1` to `100`; defaults to `20`. Values outside that range return `400`. |

Filters combine with the selected tab. Invalid enum values or service-level pagination/search validation errors return `400` validation problems. Malformed query values rejected by ASP.NET Core parameter binding also return `400`, but may use the framework's standard binding error response. Results sort by `createdAt` descending, with report ID descending as a stable tie-breaker. Response shape:

```json
{
  "items": [{
    "id": "b561e448-49d0-4f4a-ab82-7d074f8c61e7",
    "title": "Low pressure",
    "description": "Water is barely flowing.",
    "address": { "regionName": "Region I (Ilocos Region)", "provinceName": "Ilocos Norte", "cityMunicipalityName": "Adams", "barangayName": "Adams", "details": "Near the old bridge" },
    "latitude": 18.4663,
    "longitude": 120.9031,
    "status": "Submitted",
    "priority": "Normal",
    "claimedAt": null,
    "resolvedAt": null,
    "customer": { "id": "account-id", "name": "M. Reyes", "email": "customer@example.test" },
    "assignedStaff": null,
    "supplierName": "Supplier organization",
    "createdAt": "2026-10-25T08:30:00Z"
  }],
  "page": 1,
  "pageSize": 20,
  "totalCount": 1,
  "summary": { "unassigned": 1, "inProgress": 0, "highPriority": 0 }
}
```

`summary` gives organization-wide counts, independent of the current tab, search/filters, and pagination: `unassigned` counts unclaimed `Submitted` reports, `inProgress` counts all in-progress reports, and `highPriority` counts unresolved reports with `High` priority. These totals are the same for Admin and Staff. Queue items include the identifying issue and location data needed to scan the queue, assignment/claim metadata, priority, status, and timestamps; they do not include conversation history.

### Read one ticket

`GET /api/staff/reports/{id}` returns `id`, `title`, `description`, full resolved `address`, `latitude`, `longitude`, `status`, `priority`, `createdAt`, `claimedAt`, `resolvedAt`, `customer`, `assignedStaff`, and `supplierName`. It is readable by Admin and Staff regardless of assignment. Missing IDs return `404`.

### Claim, prioritize, resolve

| Method and route | Request | Result |
| --- | --- | --- |
| `POST /api/staff/reports/{id}/claim` | `{}` | Assigned Staff claims a `Submitted` report; `200` with updated ticket. Concurrent/invalid-state claim: `409`. |
| `POST /api/staff/reports/{id}/priority` | `{ "priority": "High" }` | Assigned Staff sets `Low`, `Normal`, or `High`; `200` with updated ticket. |
| `POST /api/staff/reports/{id}/status` | `{ "status": "Resolved" }` | Assigned Staff resolves an `InProgress` report; `200` with updated ticket. Only `Resolved` is accepted. |

Malformed bodies and invalid enum values return `400`; missing IDs return `404`; Admin/other Staff write attempts return `403`; attempts to resolve as an unassigned or non-assigned Staff member return `403`; repeated resolution by the assigned Staff member returns `409`. A priority change or resolution against a ticket that is already resolved returns `409`. All web mutations require ASP.NET Core antiforgery validation.

### Messages and history

`GET /api/staff/reports/{id}/messages?before={cursor}&pageSize={pageSize}` returns ticket history to Admin and Staff. `before` is a positive integer cursor (`long`). The latest page is displayed chronologically; `nextBefore` requests an older page, which the workspace prepends to the conversation. `POST /api/staff/reports/{id}/messages` accepts `{ "body": "We are checking the affected line." }` and requires the assigned Staff member. A successful create returns `200 OK` with the created message.

History uses a numeric `long` cursor. The first request returns the latest page, ordered chronologically for display; `nextBefore` requests an older page. `pageSize` defaults to `50` and accepts values from `1` to `100`; values outside that range return `400`:

```json
{
  "items": [{
    "id": "4c2fce8c-9271-4f43-9b0b-3dc9d37ee27b",
    "reportId": "b561e448-49d0-4f4a-ab82-7d074f8c61e7",
    "senderId": "account-id",
    "senderName": "A. Santos",
    "senderRole": "Staff",
    "body": "We are checking the affected line.",
    "createdAt": "2026-10-25T08:45:00Z"
  }],
  "nextBefore": 481
}
```

`nextBefore` is a nullable integer cursor and is null when there are no older items. Cursor pagination uses the report message's monotonically increasing sequence; clients pass `nextBefore` unchanged as `before` to fetch older history. Invalid cursors or page sizes return `400` validation problems.

## Customer messages

The existing `/api/reports` routes keep their current JWT contract and response shapes. This feature adds:

| Method and route | Request | Result |
| --- | --- | --- |
| `GET /api/reports/{id}/messages?before={cursor}&pageSize={pageSize}` | Customer JWT | The latest message page for that Customer's report, displayed chronologically; `nextBefore` requests an older page. |
| `POST /api/reports/{id}/messages` | `{ "body": "Thank you for the update." }` | `200 OK` with the created message for an owned report. |

Customer reads and writes are limited to the report owner and require a full Customer session. Ownership failures are `404`; invalid message content and cursor parameters are `400`. This contract supports a future Customer client; the mobile interface is not part of this feature.

## Live updates with SignalR

The hub is `/api/hubs/reports`. It accepts the Admin/Staff web cookie session and full Customer JWT authentication. Before adding a connection to a report group, it checks that Admin/Staff may read the report or that the Customer owns it. Clients invoke `Subscribe(Guid reportId)` and `Unsubscribe(Guid reportId)`; they can subscribe only to reports they are allowed to read. The hub publishes these server-to-client events:

| Event | Payload | When sent |
| --- | --- | --- |
| `ReportCreated` | `{ id }` | After a Customer report commit; connected Admin/Staff queue clients. |
| `QueueChanged` | `{ id }` | After a committed report creation, claim, priority change, or resolution; connected Admin/Staff queue clients. |
| `TicketUpdated` | `{ id }` | After a committed claim, priority change, or resolution; authorized Admin/Staff and owning Customer subscribers. |
| `MessageCreated` | Created message | After a committed message append; authorized Admin/Staff and owning Customer subscribers. |

Events are best-effort notifications emitted after the database transaction commits; a notification failure does not reverse an already committed REST write. They are not durable delivery, so clients recover missed events by refetching REST queue, ticket, or history data. SignalR accepts a Customer JWT through the `access_token` query parameter only on `/api/hubs/reports`; other REST routes do not accept query-string bearer tokens. The hub closes connections when authentication expires. Browser origins are checked against the request origin or explicit `Realtime:AllowedOrigins`; development config allows `http://localhost:5173` and `http://127.0.0.1:5173`. The Vite development server must proxy WebSocket upgrades for the hub.

## Staff web workspace

The supplier web app provides a responsive queue and ticket workspace using React Router and TanStack Query. The queue supports the four tabs, summary counts, filters/search, pagination, and clear status/priority/assignment indicators. Filter and page state stays in the URL, and opening a ticket preserves the current queue query. Opening a row shows the ticket details, resolved location, assignment, and a chronological conversation with older-history paging. Draft messages are kept separately per ticket; a failed send retains its draft and is never automatically resubmitted. Assigned Staff can claim eligible reports, set priority, add plain-text messages, and resolve active tickets. Admin and unassigned/other Staff see read-only controls appropriate to their permissions.

At widths of at least 1,280 px, the workspace shows the queue, conversation, and details in three panels. From 768 to 1,279 px, it shows the queue and one selected conversation/details panel with a details toggle. Below 768 px, it shows one panel at a time with list, conversation, and details toggles. Loading, empty, error, and stale data states are explicit. SignalR reconnect resubscribes to the selected ticket and refetches report data; message pages are deduplicated by message ID. REST mutations and events refresh the relevant TanStack Query queue, ticket, or history. No map, supply dashboard, weather warning, customer app, or customer UI is included.

## Persistence and migration

Persist priority with default `Normal`, assignee, claim timestamp (`claimedAt`), resolution timestamp (`resolvedAt`), and append-only report messages with sender, UTC creation time, and a monotonically increasing sequence for history cursors. Reports are ordered by their existing `createdAt`; there is no report `updatedAt` field. Keep domain rules in Domain, use-case orchestration and interfaces in Application, EF mapping and concurrency/persistence logic in Infrastructure, and explicit REST/SignalR contracts in Api. Implement atomic claims in the database so the single-winner guarantee holds across processes. Preserve the existing customer report schema and owner-scoped list ordering/shape.

Generate and apply schema changes as an explicit Infrastructure EF migration using `--output-dir Persistence/Migrations`. API startup must continue to avoid modifying schema. Local setup must apply all committed migrations before startup.

## Acceptance criteria

- Admin and Staff can search, filter, page, and read all tickets; summary counts reflect the whole organization regardless of the current queue query.
- Simultaneous Staff claims have one winner and persist the winner plus UTC claim time.
- Only the assigned Staff member can change priority, add Staff messages, or resolve; Admin and other Staff remain read-only.
- Only `Submitted -> InProgress -> Resolved` is possible; no reassignment or reopening is offered or accepted.
- Priorities are `Low`, `Normal`, `High`, with `Normal` as the default.
- Staff and owning Customer can read and append trimmed plain-text messages; other Customers cannot infer report existence.
- Cursor history has stable ordering and returns `items` plus `nextBefore`.
- SignalR authorization checks report access, and queue/ticket/message events are sent only after commits; reconnect/refetch restores state.
- Staff web queue and ticket workspace works at desktop and narrow viewport sizes and handles loading, empty, error, and stale states.
- Customer report submit/list/detail behavior and response contracts remain unchanged.
- Explicit migration application is documented and no schema change occurs at API startup.
