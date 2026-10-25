import { useState } from "react";
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
  Brand,
  ChangePassword,
  CreateAccount,
  FormError,
  SignIn,
} from "./features/accounts/AccountForms";
import { Reports } from "./features/reports/Reports";
import { Dashboard } from "./features/dashboard/Dashboard";

function Portal({ account }: { account: Account }) {
  const [menu, setMenu] = useState(false);
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
    <div className="portal">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="portal-header">
        <Brand />
        <span className="portal-label">Supplier portal</span>
        <button
          className="menu-button"
          aria-expanded={menu}
          aria-controls="portal-nav"
          onClick={() => setMenu(!menu)}
        >
          {menu ? "Close menu" : "Menu"}
        </button>
      </header>
      <aside className={menu ? "sidebar open" : "sidebar"} id="portal-nav">
        <nav aria-label="Main navigation">
          {!account.requiresPasswordChange && (
            <>
              <NavLink to="/dashboard" onClick={() => setMenu(false)}>
                Dashboard
              </NavLink>
              <NavLink to="/reports" onClick={() => setMenu(false)}>
                Reports
              </NavLink>
              {account.role === "Admin" && (
                <NavLink to="/accounts/new" onClick={() => setMenu(false)}>
                  Create account
                </NavLink>
              )}
            </>
          )}
          {account.requiresPasswordChange && (
            <NavLink to="/change-password">Change password</NavLink>
          )}
        </nav>
        <div className="account-summary">
          <p className="font-medium break-words">
            {account.firstName} {account.lastName}
          </p>
          <p className="muted break-all">{account.email}</p>
          <p className="muted mt-1 mb-4">{account.role}</p>
          <button
            className="secondary"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            {logout.isPending ? "Signing out…" : "Sign out"}
          </button>
          <FormError error={logout.error} />
        </div>
      </aside>
      <main id="content" className="sheet" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
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
          <button
            className="primary"
            onClick={() => void accountQuery.refetch()}
          >
            Try again
          </button>
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
                <h1>Access denied</h1>
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
