import { useCallback, useEffect, useState } from "react";
import { AppShell, Button, Navbar, PageHeader, Sidebar } from "@aqours/ui";
import { FiGrid, FiInbox, FiLock, FiLogOut, FiUserPlus } from "react-icons/fi";
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
} from "react-router";
import { queryClient } from "./shared/query";
import { api, currentAccount, type Account } from "./features/accounts/api";
import {
  ChangePassword,
  CreateAccount,
  SignIn,
} from "./features/accounts/AccountForms";
import { Reports } from "./features/reports/Reports";
import { Dashboard } from "./features/dashboard/Dashboard";

function Portal({ account }: { account: Account }) {
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  const { pathname } = useLocation();
  useEffect(() => {
    document.getElementById("content")?.scrollTo({ top: 0 });
  }, [pathname]);
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
      navbar={
        <Navbar
          brand={
            <Link to="/dashboard" aria-label="Aqours dashboard">
              <Brand />
            </Link>
          }
          context="Supplier portal"
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
          footer={
            <div className="account-summary">
              <div className="account-identity">
                <span className="account-initials" aria-hidden="true">
                  {account.firstName[0]}
                  {account.lastName[0]}
                </span>
                <div>
                  <p className="font-medium break-words">
                    {account.firstName} {account.lastName}
                  </p>
                  <p className="muted">{account.role}</p>
                </div>
              </div>
              <p className="muted account-email">{account.email}</p>
              <Button
                variant="secondary"
                className="w-full"
                disabled={logout.isPending}
                onClick={() => logout.mutate()}
              >
                <FiLogOut aria-hidden="true" />
                {logout.isPending ? "Signing out…" : "Sign out"}
              </Button>
              <FormError error={logout.error} />
            </div>
          }
        >
          {!account.requiresPasswordChange ? (
            <>
              <NavLink to="/dashboard" onClick={closeMenu}>
                <FiGrid aria-hidden="true" />
                Dashboard
              </NavLink>
              <NavLink to="/reports" onClick={closeMenu}>
                <FiInbox aria-hidden="true" />
                Reports
              </NavLink>
              {account.role === "Admin" && (
                <NavLink to="/accounts/new" onClick={closeMenu}>
                  <FiUserPlus aria-hidden="true" />
                  Create account
                </NavLink>
              )}
            </>
          ) : (
            <NavLink to="/change-password" onClick={closeMenu}>
              <FiLock aria-hidden="true" />
              Change password
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
        <Route path="/reports/*" element={<Reports account={account} />} />
        <Route path="/dashboard" element={<Dashboard account={account} />} />
        <Route
          path="/change-password"
          element={
            account.requiresPasswordChange ? (
              <ChangePassword />
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
