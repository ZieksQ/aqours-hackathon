# Aqours web starter

React, TypeScript, Vite, ESLint, and Tailwind CSS. The generated starter screen remains; supplier workflows are not implemented yet.

From the repository root:

```sh
pnpm dev:web
pnpm build:web
pnpm lint:web
```

Tailwind uses `@tailwindcss/vite` in `vite.config.ts` and `@import "tailwindcss"` in `src/index.css`, following the [official setup](https://tailwindcss.com/docs/installation/using-vite). Use its utility classes when building feature screens.

Follow the feature organization and stack requirements in [architecture](../../docs/architecture.md). See the [root README](../../README.md) for installation and API/database commands.
