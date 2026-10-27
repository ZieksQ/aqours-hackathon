import {
  Badge,
  Button,
  MetricStrip,
  PageHeader,
  Pagination,
  StatePanel,
  Table,
  buttonClassName,
} from "@aqours/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  FiCheckCircle,
  FiClock,
  FiInfo,
  FiMonitor,
  FiPlus,
  FiRotateCcw,
  FiSearch,
  FiSmartphone,
  FiUser,
  FiUserCheck,
  FiShield,
} from "react-icons/fi";
import { Link } from "react-router";
import { api, type Account } from "./api";
import "./accounts.css";

export function Accounts({ account }: { account: Account }) {
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("/accounts"),
  });
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [setup, setSetup] = useState("");
  const [page, setPage] = useState(1);
  const all = accounts.data ?? [];
  const filtered = all.filter(
    (a) =>
      (!role || a.role === role) &&
      (!setup || String(a.requiresPasswordChange) === setup) &&
      `${a.firstName} ${a.middleName ?? ""} ${a.lastName} ${a.email}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const items = filtered.slice((page - 1) * 10, page * 10);
  return (
    <section className="accounts-directory">
      <PageHeader
        title="Accounts"
        description="Directory of system administrators, staff, and customer accounts"
        actions={
          <Link to="/accounts/new" className={buttonClassName()}>
            <FiPlus aria-hidden="true" />
            Create account
          </Link>
        }
      />
      <MetricStrip
        label="Organization account counts"
        items={[
          {
            label: "Total accounts",
            value: accounts.data?.length,
            unit: "registered",
            detail: "Active directory roster",
          },
          {
            label: "Admin",
            value: accounts.data?.filter((a) => a.role === "Admin").length,
            unit: "users",
            detail: "Supplier administrators",
          },
          {
            label: "Staff",
            value: accounts.data?.filter((a) => a.role === "Staff").length,
            unit: "handlers",
            detail: "Operational handlers",
          },
          {
            label: "Customers",
            value: accounts.data?.filter((a) => a.role === "Customer").length,
            unit: "customers",
            detail: "Aqours mobile app",
          },
          {
            label: "Password setup pending",
            value: accounts.data?.filter((a) => a.requiresPasswordChange)
              .length,
            unit: "pending",
            detail: "Awaiting first sign-in password change",
          },
        ]}
      />
      <form className="account-filters" onSubmit={(e) => e.preventDefault()}>
        <div className="account-search">
          <FiSearch aria-hidden="true" />
          <input
            aria-label="Search accounts"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="account-filter-row">
          <label>
            <span className="sr-only">Role</span>
            <select
              aria-label="Role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Role: All (Admin, Staff, Customer)</option>
              {["Admin", "Staff", "Customer"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Password setup</span>
            <select
              aria-label="Password setup"
              value={setup}
              onChange={(e) => {
                setSetup(e.target.value);
                setPage(1);
              }}
            >
              <option value="">
                Status: All (Ready, Password change required)
              </option>
              <option value="false">Ready</option>
              <option value="true">Password change required</option>
            </select>
          </label>
          <Button
            variant="ghost"
            onClick={() => {
              setSearch("");
              setRole("");
              setSetup("");
              setPage(1);
            }}
          >
            <FiRotateCcw aria-hidden="true" />
            Reset
          </Button>
        </div>
      </form>
      {accounts.isPending ? (
        <StatePanel title="Loading accounts…" role="status" />
      ) : accounts.isError ? (
        <StatePanel
          title="Could not load accounts"
          action={
            <Button onClick={() => void accounts.refetch()}>Retry</Button>
          }
        >
          {accounts.error.message}
        </StatePanel>
      ) : (
        <div className="account-table-panel">
          <Table label="Account directory">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Access portal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const RoleIcon =
                  a.role === "Admin"
                    ? FiShield
                    : a.role === "Staff"
                      ? FiUserCheck
                      : FiUser;
                return (
                  <tr key={a.id}>
                    <td>
                      <strong>
                        {a.firstName} {a.lastName}
                      </strong>{" "}
                      {a.id === account.id && <Badge>You</Badge>}
                    </td>
                    <td className="account-table-email">{a.email}</td>
                    <td>
                      <Badge>
                        <RoleIcon aria-hidden="true" />
                        {a.role}
                      </Badge>
                    </td>
                    <td>
                      <span className="account-access">
                        {a.role === "Customer" ? (
                          <FiSmartphone aria-hidden="true" />
                        ) : (
                          <FiMonitor aria-hidden="true" />
                        )}
                        {a.role === "Customer" ? "Mobile app" : "Web portal"}
                      </span>
                    </td>
                    <td>
                      <Badge
                        tone={a.requiresPasswordChange ? "warning" : "success"}
                      >
                        {a.requiresPasswordChange ? (
                          <FiClock aria-hidden="true" />
                        ) : (
                          <FiCheckCircle aria-hidden="true" />
                        )}
                        {a.requiresPasswordChange
                          ? "Password change required"
                          : "Ready"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {!items.length && (
            <StatePanel title="No accounts match your filters" />
          )}
          <Pagination
            noun="accounts"
            page={page}
            pageSize={10}
            total={filtered.length}
            count={items.length}
            onChange={setPage}
          />
        </div>
      )}
      <p className="account-directory-note">
        <FiInfo aria-hidden="true" />
        Admin and Staff access the web portal; Customers use the Aqours mobile
        app. Passwords are never displayed.
      </p>
    </section>
  );
}
