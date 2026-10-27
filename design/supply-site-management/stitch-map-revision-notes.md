All six **Supply Site Management** screens have been updated to replace all user-visible numeric coordinate fields and terminology with an intuitive address and map location UI:

### Summary of Changes Across the Six Screens:

1. **Complete Removal of Numeric Coordinates**:
   - Eliminated all latitude, longitude, decimal degrees, coordinate ranges/bounds, degree symbols (`°`), EPSG/WGS84 labels, and coordinate headers across all screens.
   - Street address and natural place naming serve as the primary human-readable location interface.

2. **Screen-by-Screen Implementation**:
   - **Supply sites — Directory** (Supply sites — Directory):
     - Removed the coordinate column entirely.
     - Clean 4-column structure: **Site name**, **Address**, **Last updated**, and **Actions** (_View details_).
     - Displays all 6 canonical alphabetized records with proper pagination footer (`Showing 1–6 of 6 supply sites`, `Page 1 of 1`).
   - **Supply sites — Empty directory** (Supply sites — Empty directory):
     - Mirrored updated 4-column table structure without coordinate headers.
     - Clear empty message with `+ Add supply site` action and positive page indicator (`Page 1 of 1`).
   - **Supply sites — Add site** (Supply sites — Add site):
     - Section 3 replaced with **Site location** map picker.
     - Cartographic map view centered on Adams, Ilocos Norte with draggable site marker, zoom controls (`+` / `−`), and unobtrusive `© OpenStreetMap contributors` attribution.
     - Location label shows placed pin: _"Near the old bridge · Adams, Ilocos Norte"_.
     - Clear helper text: _"Select the site's location on the map. Drag the pin to adjust it."_ and _"The address and map location are selected separately."_
   - **Supply sites — Site details** (Supply sites — Site details):
     - Replaced numeric coordinates with a compact, read-only **Site location** map card displaying the placed pin for North Reservoir near the old bridge, alongside the full canonical address breakdown and record metadata.
   - **Supply sites — Edit site** (Supply sites — Edit site):
     - Pre-populated form matching Add Site, with the interactive map pin positioned at North Reservoir (_Near the old bridge, east gate · Adams, Ilocos Norte_).
     - Unsaved changes indicator preserved with `Save changes` and `Cancel` actions.
   - **Supply sites — Validation** (Supply sites — Validation):
     - Updated summary to _"Check 3 fields before saving:"_ targeting **Site name**, **Street or landmark details**, and **Site location**.
     - Retained valid PSGC cascading dropdown selections, while highlighting the unplaced map state with error border and clear message: _"Choose a valid site location on the map."_

3. **Shell Consistency & Design System**:
   - All screens strictly adhere to the unified 232px sidebar, 56px topbar (Elena Cruz Admin profile), IBM Plex Sans typography, brand teal `#1B6C80`, and neutral surface palettes.

Suggested review: Add interactive pin-drop animations to the Add/Edit map picker

Suggested review: Create a search-by-place shortcut above the map

Suggested review: Preview the responsive mobile layout for the map location UI
