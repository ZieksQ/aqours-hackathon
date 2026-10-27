All six cohesive desktop screens for **Aqours Supply Site Management** have been generated and added to the canvas in strict accordance with the product brief, technical API invariants, and established design system:

### 1. **Supply sites — Directory** (Supply sites — Directory)

- **Fixed Name Order & Honest Scope**: Displays all 6 canonical fixture records sorted alphabetically by name (_Adams Pump Station_, _East Distribution Tank_, _Hillside Supply Station_, _North Reservoir_, _Riverside Storage_, _West Service Tank_).
- **Clean Table Columns**: Compact canonical Philippine address, 6-decimal coordinates, local timestamp (Asia/Manila PHT), and direct _View details_ action link.
- **Strict Invariants**: No search bar, filters, sort dropdowns, export/import buttons, checkboxes, maps, or telemetry widgets.
- **Accurate Pagination**: Shows `"Showing 1–6 of 6 supply sites"`, page size fixed to default 20, with previous/next disabled.

### 2. **Supply sites — Add site** (Supply sites — Add site)

- **Two-Column Work Layout**: 300px left guidance panel matching Screen 09 (_Site specifications_, _Philippine address PSGC hierarchy rules_, and _Manual coordinates disclaimer_).
- **Hierarchical Address Inputs**: Region, Province (annotated as not applicable for NCR), City/Municipality, Sub-municipality (clearly shown as not applicable for this fixture), Barangay, and Street/landmark details (<=500 characters).
- **Coordinates & Actions**: Explicit independent numeric Latitude and Longitude fields with valid ranges, primary _Create supply site_ action, and _Cancel_.

### 3. **Supply sites — Site details** (Supply sites — Site details)

- **Readonly Record Review**: North Reservoir details with GUID (`b561e448-49d0-4f4a-ab82-7d074f8c61e7`), Created (`27 Oct 2026, 16:30 PHT`), and Last Updated (`27 Oct 2026, 17:15 PHT`) timestamps alongside API UTC reference times.
- **Authoritative Data Presentation**: Full formatted address line, complete PSGC code mappings, high-precision coordinates (`18.466300° N, 120.903100° E`), and prominent _Edit site_ action.

### 4. **Supply sites — Edit site** (Supply sites — Edit site)

- **Full Replacement State**: Pre-loaded with North Reservoir’s immutable GUID and creation timestamp, highlighting the edited street details (_"Near the old bridge, east gate"_).
- **Concurrence & Unsaved Indicators**: Subtle top cue informing the user of unsaved changes, _Save changes_ primary action, and _Cancel_ with discard confirmation helper.

### 5. **Supply sites — Validation** (Supply sites — Validation)

- **RFC-7807 Aligned 400 State**: Top error summary list with jump-to-field links.
- **Inline Error Feedback**: Explicit red border highlighting and message cues for missing required name, missing street/landmark details, and out-of-range latitude (`95.500000`), while preserving valid address choices and longitude (`120.903100`).

### 6. **Supply sites — Empty directory** (Supply sites — Empty directory)

- **First-Run State**: Preserves the exact table header shell without false metrics or illustrations, displaying _"No supply sites yet"_, guidance copy, and an _Add supply site_ CTA, with paging displaying `"Showing 0–0 of 0 supply sites"`.

All screens maintain the pale `#F4F7F6` framed canvas, 232px sidebar with "Supply sites" positioned between Reports and Accounts, IBM Plex Sans typography, teal `#1B6C80` accents, and near-black `#1D1F20` primary controls.

Suggested review: Inspect the PSGC cascading dropdowns on the Add site form

Suggested review: Review the responsive behavior on tablet widths

Suggested review: Examine the coordinate precision and validation layout
