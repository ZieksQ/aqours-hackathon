# Review notes

## Current proposal

Six desktop proposals use the existing Aqours web Stitch project and design system. The latest PNG/HTML exports are identified by the screen resource names in manifest.json; earlier generated variants remain in the remote project as revision history.

The user's map/address requirement takes precedence over the original manual-coordinate brief. Directory/empty screens present addresses; Add/Edit present map-pin selection; Details presents the address and read-only map; Validation presents a missing-location error without exposing API coordinate names or values. Visible HTML text, field values and placeholders were checked for coordinate terminology/numbers and unsupported dispatch/capacity/settings fields.

The initial generation introduced unsupported operational controls and claims. An accuracy pass, the user's map revision and a focused text cleanup removed those fields and claims from the saved review set. Stitch's own narrative files are retained as generation history; their statements about production readiness or working interactions are not verification evidence.

## Visual observations

- The directory answers which sites exist with six alphabetic sample records and honest paging. Addresses replace the coordinate column.
- Add/Edit show the required name, hierarchical address and site-location sections. The map pin is the location-selection affordance. Details shows the full selected address, map, ID and record timestamps.
- Validation retains address choices and calls out exactly three problems: site name, street/landmark details and site location.
- The empty directory shows zero records and an Add supply site action.
- Map backgrounds are illustrative design artwork, not verified real tiles. Future implementation needs the agreed Leaflet/Geoapify integration and complete provider attribution; pin placement does not geocode or validate an address.
- The generated forms still differ in density and grouping between Add/Edit/Validation. Existing droplet shape, icon set, capitalisation and spacing need final alignment during design approval. Stitch exports use Material Symbols; future web implementation must use the repository's Feather icons and existing custom Aqours brand mark.

## Verification and limits

All six downloaded PNGs decode successfully; image dimensions and SHA-256 hashes are recorded in manifest.json. The shared PSGC dataset contains the spec's Region I / Ilocos Norte / Adams / Adams codes. Static content checks confirm the selected proposals show no latitude/longitude values or fields.

Browser inspection checks the directory and Add exports at 1440, 768 and 390px. These are desktop design proposals, with responsive work still needed: the directory keeps its wide sidebar at 390px and compresses/clips content. The inspector also flags uppercase micro-labels, text near the phone edge, disabled-control contrast and excess white space. These findings are recorded in browser-verification.json, without claiming a responsive pass.

These are static exports: cascades, pin dragging, map loading/failure/retry, save, cancellation, account menus and error navigation have not been tested as application behavior. No frontend implementation, API integration, backend changes or live-data testing was performed.

## Suggested review

Review the directory and map-based Add/Edit/Details first, then the validation state. Stitch suggested reviewing the updated validation layout, verifying the address-only directory and design sign-off. User review and revisions remain the next step; no implementation has been approved.
