# Design review findings

Nine Google Stitch desktop concepts are available for review. These are design references, not implemented portal pages. The PNGs and matching HTML are retrieved from Stitch; application source, routes, components, dependencies, and behavior were not changed.

## What to review first

- Compare [Admin](02-admin-dashboard.png) and [Staff](03-staff-dashboard.png) dashboard density, KPI grouping, chart sizes, and the prominence of reports needing attention.
- Compare [Reports](04-reports.png) with the [collapsed navigation reference](07-layout-collapsed.png). The expanded design uses a labelled sidebar; the collapsed reference uses a 64px icon rail and an open account menu.
- Review the [active ticket conversation](05-ticket-active.png) and [unassigned ticket](06-ticket-unassigned.png) together. Only the assigned Staff member should reply, change priority, or resolve. Taking an unassigned report is the entry action; Admin oversight remains read-only.
- Review the [account directory](08-account-list.png) and [create-account form](09-create-account.png). The final initial-password field is empty and masked, and the first-login password change is described.

## Direction and context

Framed sheet, seed `1104220792`, selected for a shared queue used throughout the working day; no direction redraw. Existing IBM Plex Sans and blue-teal `#1B6C80` carry continuity with Aqours. The water-tinted frame, droplet, teal report data, and report journey are the product-specific elements. Exact original brand artwork and Feather icons must be reused if these designs are later implemented; Stitch's droplet and Material Symbols are approximations.

The [brief](design-brief.md) records each screen's primary question, source documents, intended roles, exact password policy, canonical illustrative data, and future scope. Dashboard analytics and account listing are proposals. No supply monitoring, weather, map, or other feature pages were generated for implementation.

## Remaining design revisions

The correction passes removed major invented government/dispatch content and repaired malformed layouts in screens 07 and 09. Some service-generated copy and styling remain inconsistent with the brief:

- Admin dashboard includes an unnecessary online-duty indicator, a capacity label, and an inspection phrase. Staff dashboard includes a field-crew phrase. Remove these in a future copy revision; online presence and dispatch are outside scope.
- The regular Reports and ticket designs remain denser than the rebuilt collapsed reference and account form. Some report IDs wrap, KPI labels render uppercase despite the sentence-case request, and small metadata needs larger type.
- Some ticket and account samples contain extra invented fixture fields or descriptions. Treat names, addresses, contact details, report references, timestamps, and all counts as fictional. The canonical fixture in the brief takes precedence when matching data across pages; no online-status or automatic-routing claim should be implemented.
- Selected-state treatment and droplet artwork vary slightly between the rebuilt screens and the earlier screens. Normalize these only after the user selects the visual direction.
- These are desktop design previews. Responsive exports retain issues, including the create-account sidebar remaining too wide at phone size, ticket metadata close to the edge, and dashboard/chart content near the phone boundary. Navigation, filters, pagination, messaging, and account creation are not connected to the application.

## Verification performed

- Downloaded all nine PNG/HTML pairs through Stitch's `download_file` MCP tool. Verified all PNGs decode, all HTML documents contain a complete document, and all nine manifest pairs exist. Recorded SHA-256 hashes and native image dimensions in [manifest.json](manifest.json).
- Verified that the create-account initial password is empty and uses `type="password"`. No real credentials or customer records were supplied to Stitch.
- Checked shared fixture arithmetic: 48 reports = 12 Submitted + 18 In progress + 18 Resolved; daily submissions sum to 48; issue categories sum to 48; Staff workloads sum to 18; account roles sum to 18. The 5 High-priority reports and 4 pending password changes are subsets. These checks validate the fixture definition, not every generated annotation or cross-screen copy.
- Visually reviewed the nine-screen overview and inspected the rebuilt account and collapsed-navigation PNGs individually.
- Rendered Admin dashboard, Reports, active ticket, collapsed navigation, and create account in local Chrome at 1440, 768, and 390px. Automated findings are retained in [browser-verification.json](browser-verification.json). Checks did **not** pass as production UI: uppercase micro-labels, contrast, dense typography, phone margins/sidebar behavior, and font/icon consistency remain. The collapsed profile-menu shadow is appropriate for a floating menu; deliberate `example.com` fixture addresses are allowed for a review prototype. Differing help/form heights are expected on the account screen. Other findings remain revision items rather than accepted production behavior.
- Source design lint was run on the initial exports and reported failures/warnings. Original generated HTML was retained rather than rewritten as frontend implementation. No application build, lint, integration, or mobile runtime test was necessary or claimed.

## Stitch export notes

Stitch's `list_screens` endpoint returned an empty object despite working screen resources. The manifest therefore uses IDs returned by generation/edit operations and direct file retrieval. The initial Admin request lost its response after creating a design; the selected Admin review version was generated separately so it could be exported. Initial generation/refinement output and prompts are retained for traceability. A replacement-generation request returned HTTP 503; a subsequent targeted edit repaired screens 07 and 09.

The service's generation notes describe its intended output and include optional suggestions. They are not validation results. Follow-up suggestions were not accepted or implemented; this package stops at the requested design review.
