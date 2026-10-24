# Philippine location data

Shared Philippine administrative hierarchy JSON for the Aqours web app, mobile app, and API. This package has no runtime dependencies.

## Provenance

Copied from `/home/zieks/Programming/Project/aisley/packages/psgc-address-data/data` without changing JSON contents or relative paths. The source package README identifies the dataset as PSA PSGC Q2 2026. That provenance is inherited from the source package; it has not been independently verified against a PSA release.

## Reading the data

Start with `data/list-of-all-regions.json`. Each entry includes a `psgc_code`, `name`, and `file`; resolve `file` relative to `data/` to read that region's hierarchy. Keep PSGC codes as strings so leading zeroes are preserved.

## Application consumption

- **Web and mobile:** When the pnpm workspaces are created, declare `"@aqours/psgc": "workspace:*"` in each consuming app. Import the index from `@aqours/psgc/data/list-of-all-regions.json` and bundle region JSON through the application's supported asset mechanism. Use explicit imports or an explicit file-to-loader mapping when the bundler requires statically discoverable assets.
- **API:** Link the canonical JSON files as content in the Infrastructure project and copy them into build and publish output. Resolve files relative to the deployed application's content location rather than a development checkout. A pnpm dependency does not make the files available to .NET.

Do not maintain independent application copies of the dataset. Generated build and publish copies are deployment artifacts, not new sources of truth.

## Updates

Replace the dataset as a unit, preserve its hierarchy and relative paths, and record the new source and release here. Validate every JSON file and verify that each region-index reference resolves before accepting an update.
