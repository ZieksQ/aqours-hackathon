# Mobile development

Follow the repository root `AGENTS.md` and `docs/architecture.md`.

- Use pnpm and the SDK-compatible Expo CLI (`pnpm exec expo install`) for approved mobile dependencies.
- Start from the repository root with `pnpm dev:mobile`.
- Test only in Expo Go connected on a real mobile phone over the development network. Do not use emulators or simulators.
- Do not create APKs, native builds, EAS builds, or generated `android/` and `ios/` projects.
- Keep the app focused on the MVP. Customer login, Home, report submission with map/GPS/coordinate location selection, owned-report history, and supplier conversations are implemented; full Profile, Updates, supplier-site maps, supply, and weather screens remain deferred. `react-native-maps` and `expo-location` are approved for the reporting flow. Obtain approval for dependencies beyond the agreed stack.
- Run `pnpm typecheck:mobile` after code changes. A passing static check does not replace verification on a real phone; report phone verification accurately.
- Use native React Native components; never import browser UI from `@aqours/ui`.
