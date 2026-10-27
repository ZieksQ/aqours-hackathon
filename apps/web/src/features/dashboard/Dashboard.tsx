import {
  Button,
  MetricStrip,
  PageHeader,
  StatePanel,
  buttonClassName,
} from "@aqours/ui";
import { FiArrowRight, FiRefreshCw, FiUserPlus } from "react-icons/fi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import type { Account } from "../accounts/api";
import { FormError } from "../../shared/FormError";
import {
  fetchOverview,
  fetchQueue,
  reportReference,
  type Ticket,
} from "../reports/api";
import { PriorityBadge, StatusBadge } from "../reports/ReportPresentation";
import { useReportConnection } from "../reports/realtime";
import "./dashboard.css";

export function Dashboard({ account }: { account: Account }) {
  const client = useQueryClient();
  useReportConnection();
  const overview = useQuery({
    queryKey: ["reports", "overview"],
    queryFn: fetchOverview,
  });
  const incoming = useQuery({
    queryKey: ["reports", "dashboard", "unassigned"],
    queryFn: () => fetchQueue("tab=unassigned&pageSize=4"),
  });
  const activeTab = account.role === "Staff" ? "mine" : "in-progress";
  const active = useQuery({
    queryKey: ["reports", "dashboard", activeTab],
    queryFn: () => fetchQueue(`tab=${activeTab}&pageSize=4`),
  });
  const summary = overview.data?.summary;
  const resolved = overview.data
    ? overview.data.totalCount -
      overview.data.summary.unassigned -
      overview.data.summary.inProgress
    : undefined;
  return (
    <section className="dashboard">
      <PageHeader
        title={account.role === "Admin" ? "Admin dashboard" : "Staff dashboard"}
        description="Water reports across all service areas."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() =>
                void client.invalidateQueries({ queryKey: ["reports"] })
              }
            >
              <FiRefreshCw aria-hidden="true" />
              Refresh
            </Button>
            {account.role === "Admin" && (
              <Link className={buttonClassName()} to="/accounts/new">
                <FiUserPlus aria-hidden="true" />
                Create account
              </Link>
            )}
          </>
        }
      />
      <MetricStrip
        label="Organization-wide report counts"
        items={[
          { label: "Total reports", value: overview.data?.totalCount },
          { label: "Unassigned", value: summary?.unassigned },
          { label: "In progress", value: summary?.inProgress },
          { label: "Resolved", value: resolved },
        ]}
      />
      <FormError error={overview.error} />
      <div className="dashboard-grid">
        <section className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <h2>Report journey</h2>
            <span className="muted">All reports</span>
          </div>
          <p className="muted">
            {summary
              ? `${summary.unassigned} reports are waiting for a handler.`
              : "Loading organization-wide reports…"}
          </p>
          <div className="journey-bars">
            {[
              { label: "Submitted", value: summary?.unassigned },
              { label: "In progress", value: summary?.inProgress },
              { label: "Resolved", value: resolved },
            ].map((item) => (
              <div className="journey-bar-row" key={item.label}>
                <span>{item.label}</span>
                <div className="journey-bar-track">
                  <div
                    style={{
                      width: `${overview.data?.totalCount ? ((item.value ?? 0) / overview.data.totalCount) * 100 : 0}%`,
                    }}
                  />
                </div>
                <strong>{item.value ?? "—"}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="dashboard-panel dashboard-focus">
          <h2>
            {account.role === "Staff" ? "Your workload" : "Report oversight"}
          </h2>
          <p className="dashboard-focus-count">
            {account.role === "Staff"
              ? (active.data?.totalCount ?? "—")
              : (summary?.highPriority ?? "—")}
          </p>
          <p className="muted">
            {account.role === "Staff"
              ? "In-progress reports assigned to you."
              : "Unresolved High-priority reports."}
          </p>
          <Link
            to={
              account.role === "Staff"
                ? "/reports?tab=mine"
                : "/reports?tab=all&priority=High"
            }
          >
            {" "}
            {account.role === "Staff"
              ? "Continue your reports"
              : "Review high-priority reports"}
            <FiArrowRight aria-hidden="true" />
          </Link>
        </section>
        <section className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <h2>Incoming reports</h2>
            <Link to="/reports?tab=unassigned">View all</Link>
          </div>
          <p className="muted">Newest submitted first · Awaiting a handler</p>
          {incoming.isPending ? (
            <p role="status" className="dashboard-loading">
              Loading incoming reports…
            </p>
          ) : incoming.isError ? (
            <StatePanel
              title="Could not load incoming reports"
              action={
                <Button
                  variant="secondary"
                  onClick={() => void incoming.refetch()}
                >
                  Retry
                </Button>
              }
            >
              {incoming.error.message}
            </StatePanel>
          ) : (
            <TicketPreviews
              tickets={incoming.data.items}
              empty="No reports are waiting for a handler."
            />
          )}
        </section>
        <section className="dashboard-panel">
          <div className="dashboard-panel-heading">
            <h2>
              {account.role === "Staff"
                ? "My assigned reports"
                : "In-progress reports"}
            </h2>
            <Link to={`/reports?tab=${activeTab}`}>View all</Link>
          </div>
          <p className="muted">
            {account.role === "Staff"
              ? "Customer conversations you are handling."
              : "Read-only oversight of supplier responses."}
          </p>
          {active.isPending ? (
            <p role="status" className="dashboard-loading">
              Loading active reports…
            </p>
          ) : active.isError ? (
            <StatePanel
              title="Could not load active reports"
              action={
                <Button
                  variant="secondary"
                  onClick={() => void active.refetch()}
                >
                  Retry
                </Button>
              }
            >
              {active.error.message}
            </StatePanel>
          ) : (
            <TicketPreviews
              tickets={active.data.items}
              empty="No active reports in this view."
            />
          )}
        </section>
      </div>
    </section>
  );
}

function TicketPreviews({
  tickets,
  empty,
}: {
  tickets: Ticket[];
  empty: string;
}) {
  if (!tickets.length)
    return <p className="dashboard-loading muted">{empty}</p>;
  return (
    <div className="dashboard-ticket-list">
      {tickets.map((ticket) => (
        <Link
          key={ticket.id}
          className="dashboard-ticket"
          to={`/reports/${ticket.id}?tab=all`}
        >
          <div>
            <strong>{ticket.title}</strong>
            <span className="muted report-subline">
              {ticket.customer.name} · {ticket.address.barangayName}
            </span>
            <span className="report-id" title={ticket.id}>
              {reportReference(ticket.id)}
            </span>
          </div>
          <div className="dashboard-ticket-state">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <FiArrowRight aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}
