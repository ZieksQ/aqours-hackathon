import {
  Alert,
  Avatar,
  Badge,
  Button,
  MetricStrip,
  PageHeader,
  StatePanel,
  Table,
  buttonClassName,
} from "@aqours/ui";
import {
  FiArrowRight,
  FiInfo,
  FiMessageSquare,
  FiPlus,
  FiUserCheck,
} from "react-icons/fi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, type Account } from "../accounts/api";
import { FormError } from "../../shared/FormError";
import {
  fetchOverview,
  fetchReportAnalytics,
  reportReference,
  timestamp,
  type Ticket,
} from "../reports/api";
import { PriorityBadge, StatusBadge } from "../reports/ReportPresentation";
import { useReportConnection } from "../reports/realtime";
import "./dashboard.css";

const dayKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export function Dashboard({ account }: { account: Account }) {
  const client = useQueryClient();
  useReportConnection();
  const overview = useQuery({
    queryKey: ["reports", "overview"],
    queryFn: fetchOverview,
  });
  const analytics = useQuery({
    queryKey: ["reports", "analytics"],
    queryFn: fetchReportAnalytics,
  });
  const reports = analytics.data ?? [];
  const summary = overview.data?.summary;
  const isAdmin = account.role === "Admin";
  const mine = reports.filter(
    (t) => t.status === "InProgress" && t.assignedStaff?.id === account.id,
  );
  const incoming = reports
    .filter((t) => t.status === "Submitted" && !t.assignedStaff)
    .slice(0, isAdmin ? 3 : 2);
  const claim = useMutation({
    mutationFn: (id: string) => api<Ticket>(`/staff/reports/${id}/claim`, {}),
    onSettled: () => client.invalidateQueries({ queryKey: ["reports"] }),
  });
  const resolved = overview.data
    ? overview.data.totalCount -
      overview.data.summary.unassigned -
      overview.data.summary.inProgress
    : undefined;
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - 6 + i);
    return {
      key: dayKey(date),
      label: date.toLocaleDateString("en-PH", {
        timeZone: "Asia/Manila",
        day: "numeric",
        month: "short",
      }),
      value: reports.filter(
        (t) => dayKey(new Date(t.createdAt)) === dayKey(date),
      ).length,
    };
  });
  const weekTotal = days.reduce((sum, d) => sum + d.value, 0);
  const workload = [
    ...reports
      .filter((t) => t.status === "InProgress" && t.assignedStaff)
      .reduce((map, t) => {
        const person = t.assignedStaff!;
        const current = map.get(person.id);
        map.set(person.id, {
          name: person.name,
          count: (current?.count ?? 0) + 1,
        });
        return map;
      }, new Map<string, { name: string; count: number }>())
      .values(),
  ].sort((a, b) => b.count - a.count);
  const issues = [
    ...reports.reduce(
      (map, t) => map.set(t.title, (map.get(t.title) ?? 0) + 1),
      new Map<string, number>(),
    ),
  ].sort((a, b) => b[1] - a[1]);
  const counts = isAdmin
    ? [
        {
          label: "Total reports",
          value: overview.data?.totalCount,
          detail: "All service areas",
        },
        {
          label: "Unassigned",
          value: summary?.unassigned,
          detail: "Awaiting staff handler",
        },
        {
          label: "In progress",
          value: summary?.inProgress,
          detail: "Handled by staff",
        },
        { label: "Resolved", value: resolved, detail: "Closed reports" },
      ]
    : [
        {
          label: "Unassigned",
          value: summary?.unassigned,
          detail: "Awaiting handler",
        },
        {
          label: "In progress",
          value: summary?.inProgress,
          detail: "Active reports across team",
        },
        {
          label: "High priority unresolved",
          value: summary?.highPriority,
          detail: "Subset of active reports",
        },
        {
          label: "My active reports",
          value: analytics.data ? mine.length : undefined,
          detail: `Handled by ${account.firstName} ${account.lastName}`,
        },
      ];
  const incomingPanel = (
    <section className="dashboard-panel incoming-panel">
      <div className="dashboard-panel-heading">
        <div>
          <h2>
            {isAdmin
              ? "Unassigned reports needing attention"
              : "Incoming unassigned reports"}{" "}
            <Badge tone="danger">
              {summary?.unassigned ?? "—"} {isAdmin ? "unassigned" : "awaiting"}
            </Badge>
          </h2>
          {isAdmin && <p className="muted">Newest submitted reports first</p>}
        </div>
        {!isAdmin && <span className="muted">Sorted: Newest first</span>}
      </div>
      <Table label="Incoming unassigned reports">
        <thead>
          <tr>
            <th>{isAdmin ? "Report ID" : "Ticket"}</th>
            <th>Issue</th>
            <th>{isAdmin ? "Customer" : "Customer / Area"}</th>
            {isAdmin ? (
              <>
                <th>Location / Area</th>
                <th>Submitted</th>
                <th>Priority</th>
              </>
            ) : (
              <th>Status</th>
            )}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {incoming.map((t) => (
            <tr key={t.id}>
              <td>
                <Link
                  className="ticket-reference"
                  to={`/reports/${t.id}?tab=all`}
                  title={t.id}
                >
                  {reportReference(t.id)}
                </Link>
              </td>
              <td>{t.title}</td>
              <td>
                {t.customer.name}
                {!isAdmin && (
                  <span className="muted dashboard-area">
                    {" "}
                    · {t.address.barangayName}
                  </span>
                )}
              </td>
              {isAdmin ? (
                <>
                  <td className="muted">{t.address.barangayName}</td>
                  <td className="muted">
                    {new Date(t.createdAt).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                    })}
                    <br />
                    {new Date(t.createdAt).toLocaleTimeString("en-PH", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>
                    <PriorityBadge priority={t.priority} />
                  </td>
                </>
              ) : (
                <td>
                  <StatusBadge status={t.status} />
                </td>
              )}
              <td>
                {isAdmin ? (
                  <Link
                    className={buttonClassName("secondary")}
                    to={`/reports/${t.id}?tab=all`}
                  >
                    View ticket
                  </Link>
                ) : (
                  <Button
                    disabled={claim.isPending}
                    onClick={() => claim.mutate(t.id)}
                  >
                    <FiUserCheck aria-hidden="true" />
                    {claim.isPending && claim.variables === t.id
                      ? "Taking…"
                      : "Take report"}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {analytics.isPending && (
        <p className="dashboard-empty" role="status">
          Loading reports…
        </p>
      )}
      {analytics.data && !incoming.length && (
        <p className="dashboard-empty muted">
          No reports are waiting for a handler.
        </p>
      )}
      <div className="dashboard-panel-footer">
        <span>
          Showing newest {incoming.length} of {summary?.unassigned ?? "—"}{" "}
          unassigned reports
        </span>
        <Link to="/reports?tab=unassigned">
          Open reports queue <FiArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
  const chart = (
    <section className="dashboard-panel submissions-panel">
      <div className="dashboard-panel-heading">
        <div>
          <h2>
            {isAdmin
              ? "7-Day submissions"
              : `Submissions volume (${days[0].label}–${days[6].label})`}
          </h2>
          <p className="muted">
            {isAdmin
              ? `${days[0].label}–${days[6].label} ${today.getFullYear()} · `
              : ""}
            Total {analytics.data ? weekTotal : "—"} reports
          </p>
        </div>
        <Badge>
          {isAdmin
            ? "Daily volume"
            : `Avg: ${(weekTotal / 7).toFixed(1)} / day`}
        </Badge>
      </div>
      <SubmissionChart days={days} loading={analytics.isPending} />
    </section>
  );
  return (
    <section
      className={`dashboard ${isAdmin ? "dashboard-admin" : "dashboard-staff"}`}
    >
      <PageHeader
        title={isAdmin ? "Admin dashboard" : "Staff dashboard"}
        description={
          isAdmin ? (
            <>
              <strong>
                {summary?.unassigned ?? "—"} reports are waiting for a handler.
              </strong>
              <span className="dashboard-date">
                {" "}
                ·{" "}
                {today.toLocaleDateString("en-PH", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </>
          ) : (
            today.toLocaleDateString("en-PH", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          )
        }
        actions={
          isAdmin && (
            <Link className={buttonClassName()} to="/accounts/new">
              <FiPlus aria-hidden="true" />
              Create account
            </Link>
          )
        }
      />
      {isAdmin && (
        <div className="dashboard-admin-notice">
          <FiInfo aria-hidden="true" />
          <p>
            <strong>Admin oversight is read-only.</strong> Report triage,
            customer messaging, and ticket resolution are managed by assigned
            Staff handlers.
          </p>
        </div>
      )}
      <MetricStrip
        label="Organization and handler report counts"
        items={counts}
      />
      {isAdmin && (
        <p className="dashboard-priority-note">
          <Badge tone="warning">
            ● {summary?.highPriority ?? "—"} unresolved reports are High
            priority
          </Badge>
        </p>
      )}
      <FormError error={overview.error} />
      <FormError error={claim.error} />
      {analytics.isError ? (
        <StatePanel
          title="Could not load report analytics"
          action={
            <Button
              variant="secondary"
              onClick={() => void analytics.refetch()}
            >
              Retry
            </Button>
          }
        >
          {analytics.error.message}
        </StatePanel>
      ) : isAdmin ? (
        <>
          <div className="dashboard-admin-row">
            {chart}
            <section className="dashboard-panel issue-panel">
              <h2>Issue breakdown</h2>
              <p className="muted">
                Total recorded: {overview.data?.totalCount ?? "—"} reports
              </p>
              <div className="issue-bars">
                {issues.map(([label, count], i) => (
                  <div key={label}>
                    <div className="issue-bar-label">
                      <strong>{label}</strong>
                      <span>
                        {count} reports (
                        {reports.length
                          ? ((count / reports.length) * 100).toFixed(1)
                          : "0.0"}
                        %)
                      </span>
                    </div>
                    <div className={`issue-bar-track issue-tone-${i % 3}`}>
                      <span
                        style={{
                          width: `${reports.length ? (count / reports.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="issue-finding">
                {issues.length ? (
                  <>
                    Primary reported issue:{" "}
                    <strong>
                      {issues[0][0]} (
                      {Math.round((issues[0][1] / reports.length) * 100)}%)
                    </strong>
                  </>
                ) : (
                  "No reports recorded yet."
                )}
              </p>
            </section>
          </div>
          <div className="dashboard-admin-row">
            {incomingPanel}
            <section className="dashboard-panel workload-panel">
              <h2>Staff workload</h2>
              <p className="muted">
                {summary?.inProgress ?? "—"} in-progress reports across{" "}
                {workload.length} handlers
              </p>
              <div className="staff-workload-list">
                {workload.map((person) => (
                  <article key={person.name}>
                    <div>
                      <Avatar name={person.name} small />
                      <strong>{person.name}</strong>
                      <span>{person.count} active</span>
                    </div>
                    <div className="workload-track">
                      <span
                        style={{
                          width: `${summary?.inProgress ? (person.count / summary.inProgress) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <p className="muted">
                      {summary?.inProgress
                        ? Math.round((person.count / summary.inProgress) * 100)
                        : 0}
                      % of active reports
                    </p>
                  </article>
                ))}
              </div>
              {!workload.length && (
                <p className="dashboard-empty muted">
                  No active Staff workload.
                </p>
              )}
            </section>
          </div>
        </>
      ) : (
        <div className="dashboard-staff-columns">
          <div className="dashboard-staff-left">
            {incomingPanel}
            {chart}
          </div>
          <div className="dashboard-staff-right">
            <section className="dashboard-panel assigned-panel">
              <div className="dashboard-panel-heading">
                <h2>
                  My assigned reports{" "}
                  <Badge tone="info">{mine.length} active</Badge>
                </h2>
                <span className="muted">Assigned to {account.firstName}</span>
              </div>
              <div className="assigned-report-list">
                {mine.slice(0, 3).map((t) => (
                  <article
                    key={t.id}
                    className={t.priority === "High" ? "assigned-high" : ""}
                  >
                    <div className="assigned-title">
                      <strong>
                        {reportReference(t.id)} · {t.title}
                      </strong>
                      <div>
                        <StatusBadge status={t.status} />
                        <Badge
                          tone={t.priority === "High" ? "danger" : "neutral"}
                        >
                          {t.priority === "High" ? "High priority" : t.priority}
                        </Badge>
                      </div>
                    </div>
                    <div className="assigned-customer">
                      <span>
                        <strong>{t.customer.name}</strong> —{" "}
                        {t.address.barangayName}
                      </span>
                    </div>
                    <div className="assigned-action">
                      <span className="muted">
                        {t.claimedAt
                          ? `Taken ${timestamp(t.claimedAt)}`
                          : "In progress"}
                      </span>
                      <Link
                        className={buttonClassName("secondary")}
                        to={`/reports/${t.id}?tab=mine`}
                      >
                        <FiMessageSquare aria-hidden="true" />
                        Continue conversation
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
              {!mine.length && (
                <p className="dashboard-empty muted">
                  No reports assigned to you.
                </p>
              )}
              <div className="dashboard-panel-footer">
                <span>
                  Showing {Math.min(3, mine.length)} of {mine.length} reports in
                  personal queue
                </span>
                <Link to="/reports?tab=mine&status=InProgress">
                  View all active <FiArrowRight aria-hidden="true" />
                </Link>
              </div>
            </section>
            <Alert>
              <strong>Triage protocol notice</strong>
              <p>
                Take an unassigned report to become its handler. Messages are
                visible to the reporting customer.
              </p>
            </Alert>
          </div>
        </div>
      )}
    </section>
  );
}

function SubmissionChart({
  days,
  loading,
}: {
  days: { key: string; label: string; value: number }[];
  loading: boolean;
}) {
  const maximum = Math.max(
    10,
    Math.ceil(Math.max(...days.map((d) => d.value)) / 5) * 5,
  );
  return (
    <div
      className="submission-chart"
      aria-label={
        loading
          ? "Loading submissions chart"
          : "Daily report submissions over the past seven days"
      }
    >
      <div className="chart-plot">
        <div className="chart-grid">
          {[maximum, maximum / 2, 0].map((tick) => (
            <span key={tick}>
              <span>{tick}</span>
            </span>
          ))}
        </div>
        <div className="chart-bars">
          {days.map((day, i) => (
            <div className={i === 6 ? "chart-today" : ""} key={day.key}>
              <div
                className="chart-bar"
                style={{ height: `${(day.value / maximum) * 100}%` }}
              >
                <span>{loading ? "—" : day.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="chart-labels">
        {days.map((day, i) => (
          <span key={day.key}>{i === 6 ? "Today" : day.label}</span>
        ))}
      </div>
    </div>
  );
}
