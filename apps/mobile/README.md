# Aqours mobile

Native React Native screens for Expo Go: Customer sign-in, required initial password change, and Home. Home loads the signed-in customer's latest report, progress, and latest supplier response, and opens a read-only report summary. Sessions refresh while the app is running; credentials stay in memory and reopening the app requires sign-in. Sign-out clears local access even if remote revocation fails.

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

Run these in separate terminals. Connect the phone and computer to the same Wi-Fi network, allow local development traffic through your firewall, and scan the Expo QR code. Use an Admin-created **Customer** account; new accounts must change their temporary password before Home opens. Restart Expo after changing environment configuration.

The development-only **Preview Home design** button opens the original Stitch sample without an API or credentials. The banner identifies sample data, and **Exit preview** returns to sign-in. Preview does not create a session or request protected data and is unavailable in production mode.

## Design rules

Source: the `design/aqours-mobile-stitch` branch, commit `9ad1a0d`, with ignored reference exports under `design/aqours-mobile-stitch/`. Its `README.md`, `review-notes.md`, `legibility-notes.md`, `01-login.png`, and `02-home.png` define the reference. The direction is **Framed sheet**, seed `1004504475`, adapted to a native phone layout.

- Keep IBM Plex Sans bundled locally, blue-teal `#1B6C80` primary actions, pale `#F4F7F6` canvas, white cards, `#D5DDE0` borders, and no decorative shadows or gradients.
- Preserve the Aqours outlined droplet and inner reflection. `assets/brand-mark.png` rasterizes the existing web mark at 4×; use Feather for interface icons.
- Use equal 24-point outer gutters, flexible screen widths, readable labels, and touch targets at least 44 points high. Let content scroll while the labeled Home / Report / Updates / Profile dock stays below it.
- Use real device status bars and safe areas. Keep login usable when the keyboard is open; provide labeled inputs, password visibility, pending feedback, validation, and API errors.
- The Home question is “What is happening with my report?” The report progress strip and supplier response carry the product identity. The login question is “How do I access my supplier-provided account?”
- Keep Submitted → In progress → Resolved consistent with the API. Account identity and report location come from the authenticated response, with no invented current location or report reference.
- Supply, map, distance, notification-count, and customer examples from Stitch are illustrative. Authenticated Home shows supply as unavailable until its API exists. The sample schematic and sample supply appear only in the labeled development preview.

Report submission, report history, an Updates inbox, full Profile, maps, supply monitoring, and weather remain deferred. The Report, Updates, and My reports controls explain their pending availability; Profile and the account avatar open account information and sign-out. No unread badge is invented.

## Verification

```sh
pnpm typecheck:mobile
pnpm --filter @aqours/mobile test
pnpm --filter @aqours/mobile exec expo install --check
```

The dependency-free API client tests cover bearer contracts, failed login, password onboarding, concurrent refresh, rejected sessions, offline sign-out, refresh/sign-out races, and error messages. Static checks and JavaScript bundling do not replace a real-phone test. Runtime checks must use Expo Go on a physical phone: verify keyboard scrolling, font loading, safe areas, password visibility, validation, Customer sign-in/onboarding, Home loading/empty/error states, pull-to-refresh, report summary, and sign-out. No APKs, native builds, emulators, or simulators are required or permitted.
