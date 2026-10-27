# Aqours web — Stitch design review

Design artifacts for review only; no frontend application changes.

- [Open the private Stitch project](https://stitch.withgoogle.com/projects/5821335657238034680)
- [App context, workflows, brand sources, and screen requirements](design-brief.md)
- [Exact generation prompts](generation-prompts.json)
- [Requested shared design tokens](design-system.json)

The product documents do not prescribe hex colors. The current web theme and previous mobile design notes supply blue-teal `#1B6C80`, near-black primary action `#1D1F20`, pale ground `#F4F7F6`, and IBM Plex Sans. Framed sheet direction, seed `1104220792`, no redraws. The Aqours droplet, teal report data, and Submitted → In progress → Resolved journey carry the product identity.

## Requested screens

1. Login.
2. Admin dashboard with KPI cards, submissions chart, issue breakdown, Staff workload, and report oversight.
3. Staff dashboard with incoming reports, own workload, report actions, and chart.
4. Reports with organization-wide KPI cards, queue tabs, filters, table, and pagination.
5. Enhanced ticket workspace with the active handler's conversation, queue, and report details.
6. Unassigned ticket workspace with Take report and an explanation of the read-only conversation.
7. Retracted sidebar and navbar reference; expanded navigation appears on other authenticated screens.
8. Admin account list with roles and password-setup state.
9. Admin create-account form.

## Product boundaries and fixtures

Admin oversees tickets read-only. Staff takes unassigned reports; only the assigned handler may change priority, reply, or resolve. No reassignment or reopening. Account listing and dashboard analytics are design proposals; the designs do not prove those capabilities are implemented. No additional supply, weather, site management, map, or settings pages are requested in this round.

All reports, names, chart values, addresses, and timestamps are illustrative fixtures described in the brief, not production data. The organization fixture has 48 reports (12 Submitted, 18 In progress, 18 Resolved); 5 unresolved High priority reports are a subset. Account fixtures total 18 (2 Admin, 4 Staff, 12 Customer); 4 requiring initial password changes are a subset.

Original Stitch HTML exports are static design references, may use external CDNs, and are not React implementation. Review PNG previews for the intended desktop appearance; responsive layouts and navigation interactions require implementation and later verification.

## Generation status

All nine review screens have been generated in Google Stitch and downloaded as PNG previews and original HTML exports. The final two screens include a repair pass for malformed layouts. No application source files were changed.

- [Overview of all nine screens](overview.png)
- [Login](01-login.png)
- [Admin dashboard](02-admin-dashboard.png) · [Staff dashboard](03-staff-dashboard.png)
- [Reports](04-reports.png)
- [Ticket: active handler](05-ticket-active.png) · [Ticket: unassigned](06-ticket-unassigned.png)
- [Collapsed sidebar and navbar](07-layout-collapsed.png)
- [Admin account list](08-account-list.png) · [Admin create account](09-create-account.png)
- [Screen IDs and export manifest](manifest.json)
- [Review findings and verification limitations](review-notes.md)
- [Initial generation notes](generation-notes.md) · [Refinement notes](refinement-notes.md) · [Final generation notes](final-generation-notes.md)

Matching `.html` files are original Stitch design references. Remaining content, typography, and responsive issues are recorded in the review notes; these exports are ready for design feedback, not production implementation approval. The manifest identifies the selected review versions among the iterations on the Stitch canvas. Stitch's generation notes describe its intended output, not verification results; optional suggestions are preserved there and have not been implemented.
