import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppShell,
  Badge,
  Button,
  Navbar,
  PageHeader,
  Sidebar,
} from "@aqours/ui";
import {
  FiChevronDown,
  FiGrid,
  FiInbox,
  FiLock,
  FiLogOut,
  FiUsers,
  FiSearch,
  FiDroplet,
  FiActivity,
  FiMap,
} from "react-icons/fi";
import { Brand } from "./shared/Brand";
import { FormError } from "./shared/FormError";
import {
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { queryClient } from "./shared/query";
import { api, currentAccount, type Account } from "./features/accounts/api";
import {
  ChangePassword,
  CreateAccount,
  SignIn,
} from "./features/accounts/AccountForms";
import { Reports } from "./features/reports/Reports";
import { Accounts } from "./features/accounts/Accounts";
import { Dashboard } from "./features/dashboard/Dashboard";
import { SupplySites } from "./features/supply-sites/SupplySites";
import { SupplyMonitoring } from "./features/supply-monitoring/SupplyMonitoring";
import { SupplierMap } from "./features/map/SupplierMap";
import { readSite } from "./features/supply-sites/api";
import { readMonitoredSite } from "./features/supply-monitoring/api";

function Portal({ account }: { account: Account }) {
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const profile = useRef<HTMLDetailsElement>(null);
  const closeMenu = useCallback(() => setMenu(false), []);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const monitoring = pathname.startsWith("/supply-monitoring");
  const siteId = pathname.match(
    /^\/(?:supply-sites|supply-monitoring)\/([0-9a-f-]{36})(?:\/edit)?$/i,
  )?.[1];
  const breadcrumbSite = useQuery({
    queryKey: monitoring
      ? ["supply-monitoring", "site", siteId ?? ""]
      : ["supply-site", siteId ?? ""],
    queryFn: () =>
      monitoring ? readMonitoredSite(siteId!) : readSite(siteId!),
    enabled:
      !!siteId &&
      (monitoring || account.role === "Admin") &&
      !account.requiresPasswordChange,
    retry: false,
  });
  useEffect(() => {
    document.getElementById("content")?.scrollTo({ top: 0 });
    if (profile.current) profile.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (
        event instanceof PointerEvent &&
        profile.current?.contains(event.target as Node)
      )
        return;
      if (profile.current?.open) {
        profile.current.open = false;
        if (event instanceof KeyboardEvent)
          profile.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, []);
  const page =
    pathname === "/map"
      ? "Map"
      : pathname.startsWith("/supply-monitoring")
        ? "Supply monitoring"
        : pathname.startsWith("/supply-sites")
          ? pathname === "/supply-sites/new"
            ? "Add supply site"
            : pathname.endsWith("/edit")
              ? "Edit supply site"
              : "Supply sites"
          : pathname.startsWith("/reports/")
            ? "Ticket workspace"
            : pathname.startsWith("/reports")
              ? "Reports"
              : pathname === "/accounts/new"
                ? "Create account"
                : pathname === "/accounts"
                  ? "Accounts"
                  : pathname === "/change-password"
                    ? "Change password"
                    : "Dashboard";
  const logout = useMutation({
    mutationFn: () => api("/auth/web/logout", {}),
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "account",
      });
      queryClient.setQueryData(["account"], null);
      queryClient.getMutationCache().clear();
    },
  });
  return (
    <AppShell
      collapsed={collapsed}
      className={`portal ${pathname.startsWith("/reports/") ? "portal-workspace" : pathname === "/accounts/new" ? "portal-create" : "portal-sheet"}`}
      navbar={
        <Navbar
          brand={
            <Link to="/dashboard" aria-label="Aqours dashboard">
              <span className="portal-brand">
                <Brand />
                <span className="portal-brand-scope">Supplier portal</span>
              </span>
            </Link>
          }
          context={
            <nav aria-label="Breadcrumb" className="portal-breadcrumb">
              <Link
                to={
                  pathname.startsWith("/supply-sites")
                    ? "/dashboard"
                    : pathname.startsWith("/accounts")
                      ? "/accounts"
                      : "/dashboard"
                }
              >
                {pathname.startsWith("/supply-sites") || monitoring
                  ? "Aqours"
                  : pathname.startsWith("/accounts")
                    ? "Accounts"
                    : pathname.startsWith("/reports")
                      ? "Aqours"
                      : "Supplier portal"}
              </Link>
              <span aria-hidden="true">/</span>
              {monitoring && siteId && (
                <>
                  <Link to="/supply-monitoring">Supply monitoring</Link>
                  <span aria-hidden="true">/</span>
                </>
              )}
              {pathname.startsWith("/supply-sites/") && (
                <>
                  <Link to="/supply-sites">Supply sites</Link>
                  <span aria-hidden="true">/</span>
                </>
              )}
              {siteId && pathname.endsWith("/edit") && (
                <>
                  <Link to={`/supply-sites/${siteId}`}>
                    {breadcrumbSite.data?.name ?? "Site details"}
                  </Link>
                  <span aria-hidden="true">/</span>
                </>
              )}
              {pathname.startsWith("/reports/") && (
                <>
                  <Link to="/reports">Reports</Link>
                  <span aria-hidden="true">/</span>
                </>
              )}
              <span aria-current="page">
                {pathname.startsWith("/reports/")
                  ? pathname.split("/").at(-1)?.slice(0, 12)
                  : siteId && !pathname.endsWith("/edit")
                    ? (breadcrumbSite.data?.name ?? "Site details")
                    : page}
              </span>
            </nav>
          }
          search={
            pathname === "/dashboard" && account.role === "Staff" ? (
              <form
                className="navbar-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  const search = new FormData(event.currentTarget).get(
                    "search",
                  );
                  navigate(
                    `/reports?tab=all&search=${encodeURIComponent(String(search ?? ""))}`,
                  );
                }}
              >
                <FiSearch aria-hidden="true" />
                <input
                  name="search"
                  aria-label="Search reports"
                  placeholder="Search reports…"
                />
              </form>
            ) : undefined
          }
          actions={
            <details className="profile-menu" ref={profile}>
              <summary
                aria-label={`Account: ${account.firstName} ${account.lastName}, ${account.role}`}
              >
                <span className="account-initials" aria-hidden="true">
                  {account.firstName[0]}
                  {account.lastName[0]}
                </span>
                <span className="profile-name">
                  {account.firstName} {account.lastName}
                  <Badge>{account.role}</Badge>
                  <span className="muted profile-email">{account.email}</span>
                </span>
                <FiChevronDown aria-hidden="true" />
              </summary>
              <div className="profile-popover">
                <p className="muted">Signed in as</p>
                <p className="font-medium">
                  {account.firstName} {account.lastName}
                </p>
                <p className="muted account-email">{account.email}</p>
                <Link
                  to="/change-password"
                  onClick={() => {
                    if (profile.current) profile.current.open = false;
                  }}
                >
                  <FiLock aria-hidden="true" />
                  Change password
                </Link>
                <Button
                  variant="ghost"
                  disabled={logout.isPending}
                  onClick={() => logout.mutate()}
                >
                  <FiLogOut aria-hidden="true" />
                  {logout.isPending ? "Signing out…" : "Sign out"}
                </Button>
                <FormError error={logout.error} />
              </div>
            </details>
          }
          navigationId="portal-nav"
          menuOpen={menu}
          onMenuToggle={() => setMenu(!menu)}
        />
      }
      sidebar={
        <Sidebar
          id="portal-nav"
          open={menu}
          onClose={closeMenu}
          collapsed={collapsed}
          onCollapse={() => setCollapsed(!collapsed)}
          footer={null}
        >
          {!account.requiresPasswordChange ? (
            <>
              <NavLink
                to="/dashboard"
                onClick={closeMenu}
                aria-label="Dashboard"
                title={collapsed ? "Dashboard" : undefined}
              >
                <FiGrid aria-hidden="true" />
                <span className="ui-nav-label">Dashboard</span>
              </NavLink>
              <NavLink
                to="/reports"
                onClick={closeMenu}
                aria-label="Reports"
                title={collapsed ? "Reports" : undefined}
              >
                <FiInbox aria-hidden="true" />
                <span className="ui-nav-label">Reports</span>
              </NavLink>
              <NavLink
                to="/map"
                onClick={closeMenu}
                aria-label="Map"
                title={collapsed ? "Map" : undefined}
              >
                <FiMap aria-hidden="true" />
                <span className="ui-nav-label">Map</span>
              </NavLink>
              <NavLink
                to="/supply-monitoring"
                onClick={closeMenu}
                aria-label="Supply monitoring"
                title={collapsed ? "Supply monitoring" : undefined}
              >
                <FiActivity aria-hidden="true" />
                <span className="ui-nav-label">Supply monitoring</span>
              </NavLink>
              {account.role === "Admin" && (
                <NavLink
                  to="/supply-sites"
                  onClick={closeMenu}
                  aria-label="Supply sites"
                  title={collapsed ? "Supply sites" : undefined}
                >
                  <FiDroplet aria-hidden="true" />
                  <span className="ui-nav-label">Supply sites</span>
                </NavLink>
              )}
              {account.role === "Admin" && (
                <NavLink
                  to="/accounts"
                  onClick={closeMenu}
                  aria-label="Accounts"
                  title={collapsed ? "Accounts" : undefined}
                >
                  <FiUsers aria-hidden="true" />
                  <span className="ui-nav-label">Accounts</span>
                </NavLink>
              )}
            </>
          ) : (
            <NavLink
              to="/change-password"
              onClick={closeMenu}
              aria-label="Change password"
              title={collapsed ? "Change password" : undefined}
            >
              <FiLock aria-hidden="true" />
              <span className="ui-nav-label">Change password</span>
            </NavLink>
          )}
        </Sidebar>
      }
    >
      <Outlet />
    </AppShell>
  );
}
function SessionRoutes() {
  const accountQuery = useQuery({
    queryKey: ["account"],
    queryFn: currentAccount,
  });
  const location = useLocation();
  if (accountQuery.isPending)
    return (
      <div className="auth-page">
        <div className="auth-brand">
          <Brand />
        </div>
        <main className="auth-form" role="status">
          <h1>Loading your portal…</h1>
        </main>
      </div>
    );
  if (accountQuery.isError)
    return (
      <div className="auth-page">
        <div className="auth-brand">
          <Brand />
        </div>
        <main className="auth-form">
          <h1>Connection unavailable</h1>
          <FormError error={accountQuery.error} />
          <Button onClick={() => void accountQuery.refetch()}>Try again</Button>
        </main>
      </div>
    );
  const account = accountQuery.data;
  if (!account)
    return (
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    );
  if (account.role === "Customer")
    return (
      <div className="auth-form">
        <h1>Customer access</h1>
        <p>Customer accounts use the mobile app.</p>
        <Link
          to="/sign-in"
          onClick={() => {
            queryClient.removeQueries({
              predicate: (query) => query.queryKey[0] !== "account",
            });
            queryClient.setQueryData(["account"], null);
          }}
        >
          Return to sign in
        </Link>
      </div>
    );
  if (
    account.requiresPasswordChange &&
    location.pathname !== "/change-password"
  )
    return <Navigate to="/change-password" replace />;
  return (
    <Routes>
      <Route element={<Portal account={account} />}>
        <Route path="/map" element={<SupplierMap />} />
        <Route path="/reports/*" element={<Reports account={account} />} />
        <Route
          path="/supply-monitoring/*"
          element={<SupplyMonitoring account={account} />}
        />
        <Route path="/dashboard" element={<Dashboard account={account} />} />
        <Route
          path="/supply-sites/*"
          element={
            account.role === "Admin" ? (
              <SupplySites />
            ) : (
              <section>
                <PageHeader title="Access denied" />
                <p>Only administrators can manage supply sites.</p>
                <Link to="/dashboard">Return to dashboard</Link>
              </section>
            )
          }
        />
        <Route
          path="/change-password"
          element={<ChangePassword required={account.requiresPasswordChange} />}
        />
        <Route
          path="/accounts"
          element={
            account.role === "Admin" ? (
              <Accounts account={account} />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/accounts/new"
          element={
            account.role === "Admin" ? (
              <CreateAccount />
            ) : (
              <section>
                <PageHeader title="Access denied" />
                <p className="mt-4 mb-6">
                  Only administrators can create accounts.
                </p>
                <Link to="/dashboard">Return to dashboard</Link>
              </section>
            )
          }
        />
        <Route
          path="*"
          element={
            <Navigate
              to={
                account.requiresPasswordChange
                  ? "/change-password"
                  : "/dashboard"
              }
              replace
            />
          }
        />
      </Route>
    </Routes>
  );
}
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
