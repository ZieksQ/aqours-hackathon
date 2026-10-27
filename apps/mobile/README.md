# Aqours mobile

Native React Native screens for Expo Go: Customer sign-in, required initial password change, Home, report submission, My reports, and report details with supplier conversations. Home loads the signed-in customer's latest report, progress, and latest supplier response. Sessions refresh while the app is running; credentials stay in memory and reopening the app requires sign-in. Sign-out clears local access even if remote revocation fails.

## Run on a real phone

From the repository root:

```sh
cp apps/mobile/.env.example apps/mobile/.env.local
```

Set `EXPO_PUBLIC_API_URL` to your computer's LAN origin, such as `http://192.168.1.100:5251`, without `/api`. This is public client configuration, never a place for secrets. After configuring the API database, secrets, and migrations as described in the root README, expose the development API to your network:

```sh
dotnet run --project apps/api/src/Aqours.Api --launch-profile http --urls http://0.0.0.0:5251
pnpm dev:mobile
```

Run these in separate terminals. Connect the phone and computer to the same Wi-Fi network, allow local development traffic through your firewall, and scan the Expo QR code. Use an Admin-created **Customer** account; new accounts must change their temporary password before Home opens. Set `EXPO_PUBLIC_GEOAPIFY_API_KEY` in the same ignored file to the public tile key from your Geoapify project. Restart Expo after changing either environment variable. The key is bundled into the client; use a dedicated public map key, never a privileged server credential. The inline map uses `https://aqours.invalid/` as its document origin; configure any Geoapify referrer/origin restrictions to permit that WebView origin.

The development-only **Preview Home design** button opens the original Stitch sample without an API or credentials. Its Report dock opens the real form for exploration with submission disabled; My reports and details show labeled sample content. The banner identifies sample data, and **Exit preview** returns to sign-in. Preview does not create a session or request protected data and is unavailable in production mode.

## Design rules

Source: the `design/aqours-mobile-stitch` branch, commit `9ad1a0d`, with ignored reference exports under `design/aqours-mobile-stitch/`. Its `README.md`, `review-notes.md`, `legibility-notes.md`, `01-login.png`, `02-home.png`, and `03-report.png` define the reference. The direction is **Framed sheet**, seed `1004504475`, adapted to a native phone layout.

- Keep IBM Plex Sans bundled locally, blue-teal `#1B6C80` primary actions, pale `#F4F7F6` canvas, white cards, `#D5DDE0` borders, and no decorative shadows or gradients.
- Preserve the Aqours outlined droplet and inner reflection. `assets/brand-mark.png` rasterizes the existing web mark at 4×; use Feather for interface icons.
- Use equal 24-point outer gutters, flexible screen widths, readable labels, and touch targets at least 44 points high. Let content scroll while the labeled Home / Report / Updates / Profile dock stays below it.
- Use real device status bars and safe areas. Keep login usable when the keyboard is open; provide labeled inputs, password visibility, pending feedback, validation, and API errors.
- The Report question is “What water problem am I reporting, and where is it?” Issue selection, description, the canonical address hierarchy, and an explicit report pin precede submission. My reports answers “What is happening with my reports?”; details show the selected report’s progress and supplier conversation.
- The Home question is “What is happening with my report?” The report progress strip and supplier response carry the product identity. The login question is “How do I access my supplier-provided account?”
- Keep Submitted → In progress → Resolved consistent with the API. Account identity and report location come from the authenticated response, with no invented current location or report reference.
- Supply, map, distance, notification-count, and customer examples from Stitch are illustrative. Authenticated Home shows supply as unavailable until its API exists. The sample schematic and sample supply appear only in the labeled development preview.

## Customer reporting

- Open **Report** from the dock or **Report a water issue** from Home. Choose No water, Low pressure, or Dirty water; add a description (up to 2,000 characters), complete the address through Barangay, and enter a street address or landmark (up to 500 characters).
- Address selectors use the canonical `@aqours/psgc` dataset with searchable native sheets. Changing a parent clears its descendants. Provinces appear only on paths that contain them, and Manila's sub-municipalities are preserved; no province is fabricated for NCR.
- Select the problem location with **Place pin manually**, tap the map and drag the pin, then confirm. **Use current location** requests foreground permission only when tapped and reads a single GPS position. Denied permission, disabled services, and timeouts retain manual map-pin selection. There are no latitude/longitude input fields. No default viewport coordinate is submitted as a selected pin.
- The map runs Leaflet 1.9.4 inside the approved Expo-compatible `react-native-webview`, with Geoapify `osm-bright` raster tiles and visible Geoapify/OpenStreetMap/OpenMapTiles credits. Leaflet JS/CSS load over HTTPS from version-pinned, integrity-checked unpkg URLs; tiles require network access and a valid Geoapify key. This bypasses Expo Go Android’s native Google Maps key issue; the unused `react-native-maps` package is removed. `expo-location` supplies optional foreground GPS only. No background tracking or native project generation is used.
- The map shows loading, missing-configuration, timeout/tile failure, and retry states. Pin confirmation is enabled only after tiles load and a location is selected; the default viewport never selects a point. Only coordinate selections and map status cross the WebView bridge, and coordinates are validated before entering form state.
- Submission calls `POST /api/reports` with Customer Bearer authentication, shows a receipt and the real reference, and invalidates owned-report queries. Inputs and navigation are locked while sending; mutations never retry automatically. A failed request retains the draft. If connectivity fails after sending, check My reports before trying again because the API has no idempotency contract.
- **My reports** loads owned reports in pages of 20. Open a report for its description, complete address, coordinates, progress, and supplier conversation; older messages load via the API cursor. Replies (up to 2,000 characters) are available only while In progress. Conflicts refresh the report and keep the draft. Submitted and Resolved conversations are read-only.
- Pull down to refresh Home, history, or details. Home and an open detail check the API every 30 seconds while the app is active; reporting does not use a realtime connection. Loading, empty, failure, and cached-data states are explicit.
- Report and reply drafts stay in memory across navigation and are cleared on sign-out or app closure; successful sends clear their draft. There is no offline submission queue.

An Updates inbox, full Profile, supplier-site maps, supply monitoring, and weather remain deferred. Updates links to My reports; Profile and the account avatar open account information and sign-out. No unread badge is invented.

## Verification

```sh
pnpm typecheck:mobile
pnpm --filter @aqours/mobile test
pnpm --filter @aqours/mobile exec expo install --check
```

The dependency-free tests cover bearer contracts, failed login, password onboarding, concurrent refresh, rejected sessions, offline sign-out, refresh/sign-out races, report submission and message contracts, nested validation errors, coordinate boundaries, map bridge validation, pin selection and tile-failure behavior, form requirements, and ancestry/code preservation for every barangay in all 18 canonical regions. Static checks and JavaScript bundling do not replace a real-phone test. Runtime checks must use Expo Go on a physical phone: verify keyboard scrolling, font loading, safe areas, password visibility, validation, Customer sign-in/onboarding, Home loading/empty/error states, pull-to-refresh, and sign-out. For reporting, verify all three issue types, empty and maximum-length inputs, searchable cascading address selectors (including NCR/Manila), GPS allow/deny/services-off, map tap/drag/confirm/cancel, map failure/retry, receipt/navigation/draft retention, history pagination, conversation paging, replies and resolution conflicts, and keyboard/safe-area layout on a narrow phone. These native interactions still require a physical phone; source lint and Android/iOS JavaScript exports do not prove them. No APKs, native builds, emulators, or simulators are required or permitted.
