import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { FiMenu, FiX } from "react-icons/fi";
import { Button } from "./Controls";

const compactQuery = "(max-width: 959px)";
function subscribeCompact(callback: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function getCompact() {
  return window.matchMedia(compactQuery).matches;
}

export function Navbar({
  brand,
  context,
  navigationId,
  menuOpen,
  onMenuToggle,
}: {
  brand: ReactNode;
  context: ReactNode;
  navigationId: string;
  menuOpen: boolean;
  onMenuToggle: () => void;
}) {
  return (
    <header className="ui-navbar">
      <div className="ui-navbar-brand">{brand}</div>
      <div className="ui-navbar-context">{context}</div>
      <Button
        variant="ghost"
        className="ui-menu-toggle"
        aria-expanded={menuOpen}
        aria-controls={navigationId}
        onClick={onMenuToggle}
      >
        <FiMenu aria-hidden="true" />
        Menu
      </Button>
    </header>
  );
}

export function Sidebar({
  id,
  open,
  onClose,
  children,
  footer,
  label = "Main navigation",
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  label?: string;
}) {
  const compact = useSyncExternalStore(
    subscribeCompact,
    getCompact,
    () => false,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  // Native modal behavior supplies focus trapping, background inertness, and focus return.
  useEffect(() => {
    const element = dialog.current;
    if (!compact || !element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [compact, open]);

  // A resize back to desktop must not leave the mobile menu open for the next visit.
  useEffect(() => {
    if (!compact && open) onClose();
  }, [compact, open, onClose]);

  const contents = (
    <>
      <nav aria-label={label} className="ui-sidebar-nav">
        {children}
      </nav>
      <div className="ui-sidebar-footer">{footer}</div>
    </>
  );
  if (!compact)
    return (
      <aside id={id} className="ui-sidebar" aria-label={label}>
        {contents}
      </aside>
    );

  return (
    <dialog
      id={id}
      ref={dialog}
      className="ui-sidebar ui-sidebar-dialog"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX > bounds.right ||
          event.clientY > bounds.bottom ||
          event.clientX < bounds.left ||
          event.clientY < bounds.top
        )
          onClose();
      }}
    >
      <div className="ui-sidebar-mobile-header">
        <span>{label}</span>
        <Button variant="ghost" onClick={onClose} aria-label="Close menu">
          <FiX aria-hidden="true" />
        </Button>
      </div>
      {contents}
    </dialog>
  );
}

export function AppShell({
  navbar,
  sidebar,
  children,
}: {
  navbar: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ui-shell">
      <a className="ui-skip-link" href="#content">
        Skip to content
      </a>
      {navbar}
      {sidebar}
      <main id="content" className="ui-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
