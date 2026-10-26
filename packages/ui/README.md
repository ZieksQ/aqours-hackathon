# `@aqours/ui`

Reusable browser UI for the Aqours supplier portal. Import components from `@aqours/ui`; React Native screens use native components and must not import this package.

## Public exports

| Export | Purpose and props |
| --- | --- |
| `Alert` | Status message with `tone="info" | "error" | "success"` (defaults to `info`), `children`, and optional `className`. Error tone uses alert semantics; other tones use status semantics. |
| `Button` | Native button with `variant="primary" | "secondary" | "ghost"` (defaults to `primary`), standard button attributes, and `type="button"` by default. Set `type="submit"` for form submission. |
| `Field` | Label wrapper for a control: required `id`, `label`, and `children`; optional `optional` and `error`. The child control should use the same `id`; connect its error description with `aria-describedby` and set `aria-invalid` when applicable. |
| `PageHeader` | Page title and optional `description`, `actions`, and `back` content. |
| `StatePanel` | Empty/loading/error state presentation with required `title`, optional `children`, `action`, and `role="alert" | "status"`. |
| `AppShell` | Portal layout receiving `navbar`, `sidebar`, and main `children`. It provides the skip link and a viewport-bounded layout with independent sidebar and main-content scrolling. |
| `Navbar` | Top navigation receiving `brand`, `context`, `navigationId`, controlled `menuOpen`, and `onMenuToggle`. The menu button controls the matching `Sidebar` id. |
| `Sidebar` | Navigation area receiving `id`, controlled `open`, `onClose`, navigation `children`, required `footer`, and optional accessible `label` (defaults to “Main navigation”). On compact screens it opens as a native modal dialog with focus handling, Escape close, and backdrop dismissal. |
| `buttonClassName` | Returns the shared button classes for a router `Link` or other non-button element. Accepts optional `ButtonVariant` (`primary`, `secondary`, `ghost`) and `className`. |
| `ButtonVariant` | TypeScript union of the supported button variants. |

## Styles

Import the package stylesheet once from the web app's global stylesheet:

```css
@import "@aqours/ui/styles.css";
```

The package defines the shared controls and portal layout styles. The app owns design tokens, global focus treatment, form-control styling, and feature-specific styles. Components use the app's CSS custom properties when available and provide fallbacks for the package-level layout and controls.

## Example

```tsx
import { useState } from "react";
import { AppShell, Navbar, Sidebar } from "@aqours/ui";

function PortalLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigationId = "portal-navigation";

  return (
    <AppShell
      navbar={
        <Navbar
          brand={<a href="/">Aqours</a>}
          context="Supplier portal"
          navigationId={navigationId}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((open) => !open)}
        />
      }
      sidebar={
        <Sidebar
          id={navigationId}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          footer={<span>Supplier</span>}
        >
          {/* App-owned route links go here. */}
        </Sidebar>
      }
    >
      {children}
    </AppShell>
  );
}
```

Keep route links, permissions, data, and feature behavior in `apps/web`. Use `@aqours/ui` for shared presentation and pass app-owned content through props and children. Use the installed Feather icons from `react-icons/fi` for interface icons. Mark decorative icons `aria-hidden="true"`; give icon-only controls an accessible name. Preserve the existing custom Aqours brand mark in `apps/web/src/shared/Brand.tsx` rather than replacing it with an icon-library symbol.
