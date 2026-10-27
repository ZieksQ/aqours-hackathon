import {
  Alert,
  Avatar,
  Badge,
  Button,
  MetricStrip,
  PageHeader,
  Pagination,
  StatePanel,
  Table,
  buttonClassName,
} from "@aqours/ui";
import {
  FiArrowDown,
  FiArrowLeft,
  FiCheckCircle,
  FiInfo,
  FiLock,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiSliders,
  FiUserCheck,
} from "react-icons/fi";
import { useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import { api, ApiError, type Account } from "../accounts/api";
import { FormError } from "../../shared/FormError";
import {
  addressText,
  fetchQueue,
  fetchOverview,
  timestamp,
  type History,
  type Ticket,
} from "./api";
import { useReportConnection } from "./realtime";
import { StatusBadge, PriorityBadge } from "./ReportPresentation";
import "./reports.css";

const tabs = [
  ["all", "All"],
  ["unassigned", "Unassigned"],
  ["mine", "Mine"],
  ["in-progress", "In progress"],
];
const shortReference = (id: string) => (id.length > 20 ? id.slice(0, 8) : id);
const compactDate = (value: string) =>
  new Date(value).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const queueDate = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  const time = date.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return date.toDateString() === today.toDateString()
    ? time
    : `${date.toLocaleDateString("en-PH", { day: "numeric", month: "short" })}, ${time}`;
};

export function Reports({ account }: { account: Account }) {
  const id = useParams()["*"] || undefined;
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const tab = params.get("tab") ?? "all";
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState("conversation");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [claimNotice, setClaimNotice] = useState("");
  const client = useQueryClient();
  const queue = useQuery({
    queryKey: ["reports", "queue", query],
    queryFn: () => fetchQueue(query),
  });
  const overview = useQuery({
    queryKey: ["reports", "overview"],
    queryFn: fetchOverview,
  });
  const mine = useQuery({
    queryKey: ["reports", "mine-count"],
    queryFn: () => fetchQueue("tab=mine&pageSize=1"),
    enabled: account.role === "Staff" && !id,
  });
  const ticket = useQuery({
    queryKey: ["reports", "ticket", id],
    queryFn: () => api<Ticket>(`/staff/reports/${id}`),
    enabled: !!id,
  });
  const realtime = useReportConnection(id);
  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    next.delete("page");
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  };
  const claim = useMutation({
    mutationFn: (ticketId: string) =>
      api<Ticket>(`/staff/reports/${ticketId}/claim`, {}),
    onSuccess: async () => {
      setClaimNotice("");
      await client.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: async (error, ticketId) => {
      if (error instanceof ApiError && error.status === 409) {
        const latest = await api<Ticket>(`/staff/reports/${ticketId}`).catch(
          () => null,
        );
        setClaimNotice(
          latest?.assignedStaff
            ? `${latest.assignedStaff.name} claimed this report. The queue has been refreshed.`
            : "This report has already been claimed. The queue has been refreshed.",
        );
        await client.invalidateQueries({ queryKey: ["reports"] });
      }
    },
  });
  const page = queue.data?.page ?? Number(params.get("page") || 1);
  const link = (ticketId: string) =>
    `/reports/${ticketId}${query ? `?${query}` : ""}`;
  const pager = (compact = false) =>
    queue.data ? (
      <Pagination
        compact={compact}
        page={page}
        pageSize={queue.data.pageSize}
        total={queue.data.totalCount}
        count={queue.data.items.length}
        noun="reports"
        disabled={queue.isFetching}
        onChange={(next) => update({ page: String(next) })}
      />
    ) : null;
  const takeButton = (t: Ticket) =>
    account.role === "Staff" && t.status === "Submitted" && !t.assignedStaff ? (
      <Button
        className="report-action"
        disabled={claim.isPending}
        onClick={() => {
          setClaimNotice("");
          claim.mutate(t.id);
        }}
      >
        <FiUserCheck aria-hidden="true" />
        {claim.isPending && claim.variables === t.id
          ? "Taking…"
          : "Take report"}
      </Button>
    ) : null;
  const counts: Record<string, number | undefined> = {
    all: overview.data?.totalCount,
    unassigned: overview.data?.summary.unassigned,
    mine: mine.data?.totalCount,
    "in-progress": overview.data?.summary.inProgress,
  };
  const visibleTabs = tabs.filter(
    ([value]) => account.role === "Staff" || value !== "mine",
  );
  const filters = [
    {
      key: "status",
      label: "Status",
      options: [
        ["Submitted", "Submitted"],
        ["InProgress", "In progress"],
        ["Resolved", "Resolved"],
      ],
    },
    {
      key: "priority",
      label: "Priority",
      options: [
        ["Low", "Low"],
        ["Normal", "Normal"],
        ["High", "High"],
      ],
    },
    {
      key: "assignment",
      label: "Assignment",
      options: [
        ["unassigned", "Unassigned"],
        ["mine", "Assigned to me"],
        ["assigned", "Assigned"],
      ],
    },
  ];
  return (
    <section
      className={`reports ${id ? `reports-workspace ${ticket.data?.status === "Submitted" && !ticket.data.assignedStaff ? "workspace-unassigned" : ""}` : "reports-queue"}`}
    >
      {claimNotice && <Alert>{claimNotice}</Alert>}
      {!claimNotice && <FormError error={claim.error} />}
      {!id ? (
        <>
          <PageHeader
            title="Reports"
            description="Customer reports across all service areas."
          />
          <MetricStrip
            label="Organization-wide report counts"
            items={[
              { label: "Total reports", value: overview.data?.totalCount },
              { label: "Unassigned", value: overview.data?.summary.unassigned },
              {
                label: "In progress",
                value: overview.data?.summary.inProgress,
              },
              {
                label: "Resolved",
                value: overview.data
                  ? overview.data.totalCount -
                    overview.data.summary.unassigned -
                    overview.data.summary.inProgress
                  : undefined,
              },
            ]}
          />
          {overview.isError && (
            <LoadError
              error={overview.error}
              retry={() => void overview.refetch()}
            />
          )}
          <div className="queue-advisory">
            <span className="queue-priority-note">
              <FiInfo aria-hidden="true" />
              {overview.data?.summary.highPriority ?? "—"} unresolved reports
              are High priority
            </span>
            <span className="queue-freshness">
              Last refreshed:{" "}
              {queue.dataUpdatedAt
                ? new Date(queue.dataUpdatedAt).toLocaleTimeString("en-PH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}{" "}
              ·{" "}
              <span role="status">
                {realtime.state === "Connected"
                  ? "Live updates connected"
                  : "Live updates delayed"}
              </span>
            </span>
          </div>
          <div className="report-toolbar">
            <nav className="report-tabs" aria-label="Report views">
              {visibleTabs.map(([value, label]) => (
                <Button
                  variant="ghost"
                  key={value}
                  data-view={value}
                  aria-current={tab === value ? "page" : undefined}
                  onClick={() =>
                    update({
                      tab: value,
                      status: "",
                      priority: "",
                      assignment: "",
                    })
                  }
                >
                  <span>{label}</span>
                  <span className="report-tab-count">
                    ({counts[value] ?? "—"})
                  </span>
                </Button>
              ))}
            </nav>
            <form
              className="report-search"
              onSubmit={(event) => {
                event.preventDefault();
                update({
                  search: String(
                    new FormData(event.currentTarget).get("search") ?? "",
                  ),
                });
              }}
            >
              <div className="report-search-field">
                <Button
                  variant="ghost"
                  type="submit"
                  aria-label="Search reports"
                >
                  <FiSearch aria-hidden="true" />
                </Button>
                <input
                  key={params.get("search")}
                  name="search"
                  aria-label="Search reports"
                  placeholder="Search report ID, customer, address…"
                  defaultValue={params.get("search") ?? ""}
                  maxLength={200}
                />
              </div>
              <Button
                className="report-filter-toggle"
                variant="secondary"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <FiSliders aria-hidden="true" />
                Filters
              </Button>
              <div
                className={`report-filter-fields${filtersOpen ? " filters-open" : ""}`}
              >
                {filters.map((filter) => (
                  <label key={filter.key}>
                    <span className="sr-only">{filter.label}</span>
                    <select
                      aria-label={filter.label}
                      value={params.get(filter.key) ?? ""}
                      onChange={(event) =>
                        update({ [filter.key]: event.target.value })
                      }
                    >
                      <option value="">{filter.label}: All</option>
                      {filter.options
                        .filter(
                          ([value]) =>
                            filter.key !== "assignment" ||
                            value !== "mine" ||
                            account.role === "Staff",
                        )
                        .map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
              <Button
                variant="secondary"
                aria-label="Refresh reports"
                title="Refresh reports"
                onClick={() =>
                  void client.invalidateQueries({ queryKey: ["reports"] })
                }
              >
                <FiRefreshCw aria-hidden="true" />
              </Button>
            </form>
          </div>
          {queue.isPending ? (
            <StatePanel title="Loading report queue…" role="status" />
          ) : queue.isError ? (
            <LoadError error={queue.error} retry={() => void queue.refetch()} />
          ) : (
            <div className="queue-table-panel">
              <Table label="Reports queue" className="report-table">
                <thead>
                  <tr>
                    <th>Report ID</th>
                    <th>Issue</th>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Handler</th>
                    <th>Submitted</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.data.items.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link
                          to={link(t.id)}
                          title={t.id}
                          onClick={() => setPanel("conversation")}
                        >
                          {shortReference(t.id)}
                        </Link>
                      </td>
                      <td>
                        <span
                          className={`report-issue issue-${t.title.replaceAll(" ", "-").toLowerCase()}`}
                        >
                          {t.title}
                        </span>
                      </td>
                      <td>{t.customer.name}</td>
                      <td className="muted">{t.address.barangayName}</td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td>
                        <PriorityBadge priority={t.priority} />
                      </td>
                      <td>
                        {t.assignedStaff ? (
                          <span className="report-handler">
                            <Avatar small name={t.assignedStaff.name} />
                            <span>{t.assignedStaff.name}</span>
                          </span>
                        ) : (
                          <em className="muted">Unassigned</em>
                        )}
                      </td>
                      <td>
                        <time dateTime={t.createdAt}>
                          {queueDate(t.createdAt)}
                        </time>
                      </td>
                      <td className="report-row-action">
                        {takeButton(t) ?? (
                          <Link
                            className={buttonClassName(
                              "secondary",
                              "report-action",
                            )}
                            to={link(t.id)}
                            onClick={() => setPanel("conversation")}
                          >
                            {t.status === "Resolved"
                              ? "View report"
                              : "Open conversation"}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {!queue.data.items.length && (
                <StatePanel
                  title="No reports in this view"
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => setParams({ tab: "all" })}
                    >
                      View all reports
                    </Button>
                  }
                >
                  Try another tab or clear your search and filters.
                </StatePanel>
              )}
              {pager()}
            </div>
          )}
        </>
      ) : (
        <>
          <h1 className="sr-only">Ticket workspace</h1>
          <div className="workspace-switch">
            {[
              ["list", "Ticket list"],
              ["conversation", "Conversation"],
              ["details", "Details"],
            ].map(([value, label]) => (
              <Button
                key={value}
                variant="ghost"
                aria-pressed={panel === value}
                onClick={() => setPanel(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className={`workspace-grid show-${panel}`}>
            <aside
              className="ticket-list"
              aria-label="Tickets in current queue"
            >
              <div className="ticket-list-controls">
                <div className="ticket-list-heading">
                  <h2>Reports queue</h2>
                  <Badge>{queue.data?.totalCount ?? "—"} reports</Badge>
                </div>
                <form
                  className="ticket-queue-search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    update({
                      search: String(
                        new FormData(event.currentTarget).get("search") ?? "",
                      ),
                    });
                  }}
                >
                  <FiSearch aria-hidden="true" />
                  <input
                    name="search"
                    aria-label="Search current queue"
                    placeholder="Search reports…"
                    defaultValue={params.get("search") ?? ""}
                  />
                </form>
                <nav
                  className="ticket-queue-tabs"
                  aria-label="Workspace queue views"
                >
                  {visibleTabs
                    .filter(([value]) => value !== "in-progress")
                    .map(([value, label]) => (
                      <Button
                        key={value}
                        variant="ghost"
                        aria-current={tab === value ? "page" : undefined}
                        onClick={() => update({ tab: value, search: "" })}
                      >
                        {label}
                      </Button>
                    ))}
                </nav>
              </div>
              <div className="ticket-list-scroll">
                {queue.isPending ? (
                  <p role="status" className="report-empty">
                    Loading tickets…
                  </p>
                ) : queue.isError ? (
                  <LoadError
                    error={queue.error}
                    retry={() => void queue.refetch()}
                  />
                ) : (
                  <>
                    {queue.data.items.map((t) => (
                      <Link
                        className="ticket-list-row"
                        key={t.id}
                        aria-current={id === t.id ? "page" : undefined}
                        to={link(t.id)}
                        onClick={() => setPanel("conversation")}
                      >
                        <div className="ticket-row-title">
                          <strong title={t.id}>{shortReference(t.id)}</strong>
                          <StatusBadge status={t.status} />
                        </div>
                        <strong>{t.customer.name}</strong>
                        <span className="muted ticket-row-issue">
                          {t.title} · {t.address.barangayName}
                        </span>
                        <div className="ticket-row-bottom">
                          <PriorityBadge priority={t.priority} />
                          <span>{t.assignedStaff?.name ?? "Unassigned"}</span>
                        </div>
                      </Link>
                    ))}
                    {!queue.data.items.length && (
                      <p className="report-empty">
                        No matching tickets.{" "}
                        <Link to="/reports?tab=all">View all reports</Link>
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="ticket-list-footer">
                <Link to={`/reports${query ? `?${query}` : ""}`}>
                  <FiArrowLeft aria-hidden="true" />
                  Report queue
                </Link>
                <span role="status">
                  {realtime.state === "Connected"
                    ? "Ticket queue synced"
                    : "Updates delayed"}
                </span>
              </div>
            </aside>
            {ticket.isPending ? (
              <div className="conversation" role="status">
                Loading ticket…
              </div>
            ) : ticket.isError ? (
              <div className="conversation">
                <LoadError
                  error={ticket.error}
                  retry={() => void ticket.refetch()}
                />
              </div>
            ) : (
              ticket.data && (
                <TicketWorkspace
                  key={id}
                  ticket={ticket.data}
                  account={account}
                  draft={drafts[id] ?? ""}
                  setDraft={(value) =>
                    setDrafts((previous) => ({ ...previous, [id]: value }))
                  }
                  claimButton={takeButton(ticket.data)}
                />
              )
            )}
          </div>
        </>
      )}
    </section>
  );
}

function LoadError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <StatePanel
      role="alert"
      title={
        error instanceof ApiError && error.status === 404
          ? "Ticket unavailable"
          : "Could not load reports"
      }
      action={
        <Button variant="secondary" onClick={retry}>
          Retry
        </Button>
      }
    >
      {error.message}
    </StatePanel>
  );
}

function TicketWorkspace({
  ticket,
  account,
  draft,
  setDraft,
  claimButton,
}: {
  ticket: Ticket;
  account: Account;
  draft: string;
  setDraft: (value: string) => void;
  claimButton: React.ReactNode;
}) {
  const client = useQueryClient();
  const [resolveConfirm, setResolveConfirm] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const history = useInfiniteQuery({
    queryKey: ["reports", "messages", ticket.id],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) =>
      api<History>(
        `/staff/reports/${ticket.id}/messages${pageParam ? `?before=${pageParam}` : ""}`,
      ),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const messages = [
    ...new Map(
      (
        history.data?.pages
          .slice()
          .reverse()
          .flatMap((page) => page.items) ?? []
      ).map((m) => [m.id, m]),
    ).values(),
  ];
  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    if (lastId && stick.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [lastId]);
  const refresh = () => client.invalidateQueries({ queryKey: ["reports"] });
  const send = useMutation({
    mutationFn: (body: string) =>
      api(`/staff/reports/${ticket.id}/messages`, { body }),
    onSuccess: async (_, body) => {
      if (draft === body) setDraft("");
      stick.current = true;
      await refresh();
    },
    onError: () => {
      void refresh();
    },
  });
  const change = useMutation({
    mutationFn: (value: { priority: string } | { status: string }) =>
      api(
        `/staff/reports/${ticket.id}/${"priority" in value ? "priority" : "status"}`,
        value,
      ),
    onSuccess: async () => {
      setResolveConfirm(false);
      await refresh();
    },
    onError: () => {
      void refresh();
    },
  });
  const writable =
    account.role === "Staff" &&
    ticket.assignedStaff?.id === account.id &&
    ticket.status === "InProgress";
  const reason =
    ticket.status === "Resolved"
      ? "This ticket is resolved. Its conversation is read-only."
      : account.role === "Admin"
        ? "Administrator oversight is read-only."
        : !ticket.assignedStaff
          ? "Take this report to start the conversation."
          : ticket.assignedStaff.id !== account.id
            ? `Only ${ticket.assignedStaff.name}, the assigned handler, can reply or change this ticket.`
            : "";
  const isUnassigned = !ticket.assignedStaff && ticket.status === "Submitted";
  return (
    <>
      <div className="conversation">
        <header className="conversation-header">
          <h2 className="conversation-title">
            <span title={ticket.id}>{shortReference(ticket.id)}</span> —{" "}
            {ticket.title}
          </h2>
          <div className="ticket-toolbar">
            <StatusBadge status={ticket.status} />
            <div className="ticket-priority-control">
              <label htmlFor="ticket-priority">Priority:</label>
              {writable ? (
                <select
                  id="ticket-priority"
                  value={ticket.priority}
                  disabled={change.isPending}
                  onChange={(event) =>
                    change.mutate({ priority: event.target.value })
                  }
                >
                  {["Low", "Normal", "High"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              ) : (
                <PriorityBadge priority={ticket.priority} />
              )}
            </div>
            {writable && (
              <Button
                variant="secondary"
                className="ticket-resolve"
                disabled={change.isPending || resolveConfirm}
                onClick={() => setResolveConfirm(true)}
              >
                <FiCheckCircle aria-hidden="true" />
                Resolve ticket
              </Button>
            )}
            {isUnassigned && (
              <span className="ticket-handler-state">
                Handler: <strong>Unassigned</strong>
              </span>
            )}
          </div>
        </header>
        {!isUnassigned && (
          <div className="conversation-permission">
            <FiInfo aria-hidden="true" />
            <p>
              {reason ||
                `Only ${ticket.assignedStaff?.name} can update status and send messages.`}
            </p>
          </div>
        )}
        {resolveConfirm && writable && (
          <div
            className="resolve-confirm"
            role="group"
            aria-label="Confirm ticket resolution"
          >
            <p>Resolve this ticket? The conversation will become read-only.</p>
            <div>
              <Button
                disabled={change.isPending}
                onClick={() => change.mutate({ status: "Resolved" })}
              >
                {change.isPending ? "Resolving…" : "Confirm resolution"}
              </Button>
              <Button
                variant="ghost"
                disabled={change.isPending}
                onClick={() => setResolveConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        <FormError error={change.error} />
        <div
          className="conversation-history"
          ref={scroll}
          onScroll={(event) => {
            const node = event.currentTarget;
            stick.current =
              node.scrollHeight - node.scrollTop - node.clientHeight < 80;
          }}
        >
          {isUnassigned && (
            <div className="unassigned-intro">
              <FiUserCheck aria-hidden="true" />
              <div>
                <h3>This report is currently unassigned.</h3>
                <p>
                  Taking this report makes you its handler. Messages and updates
                  will be visible to the reporting customer.
                </p>
              </div>
              {claimButton}
            </div>
          )}
          {history.hasNextPage && (
            <Button
              variant="ghost"
              className="history-older"
              disabled={history.isFetchingNextPage}
              onClick={() => {
                stick.current = false;
                void history.fetchNextPage();
              }}
            >
              {history.isFetchingNextPage ? "Loading…" : "Load older messages"}
            </Button>
          )}
          <article className="chat-message message-customer initial-report">
            <div className="message-meta">
              <strong>{ticket.customer.name}</strong>
              <span>Customer</span>
              <time dateTime={ticket.createdAt}>
                {compactDate(ticket.createdAt)}
              </time>
            </div>
            <p className="message-bubble">{ticket.description}</p>
          </article>
          {ticket.claimedAt && ticket.assignedStaff && (
            <div className="claim-event">
              <FiUserCheck aria-hidden="true" />
              {ticket.assignedStaff.name} took this report. Status changed to In
              progress.{" "}
              <time dateTime={ticket.claimedAt}>
                {compactDate(ticket.claimedAt)}
              </time>
            </div>
          )}
          {history.isPending && (
            <p role="status" className="report-empty">
              Loading conversation…
            </p>
          )}
          {history.isError && (
            <LoadError
              error={history.error}
              retry={() => void history.refetch()}
            />
          )}
          {messages.map((message) => (
            <article
              key={message.id}
              className={`chat-message ${message.senderRole === "Customer" ? "message-customer" : "message-staff"}`}
            >
              <div className="message-meta">
                <strong>{message.senderName}</strong>
                <span>{message.senderRole}</span>
                <time dateTime={message.createdAt}>
                  {compactDate(message.createdAt)}
                </time>
              </div>
              <p className="message-bubble">{message.body}</p>
            </article>
          ))}
        </div>
        <form
          className={`report-composer${!writable ? " composer-readonly" : ""}`}
          onSubmit={(event) => {
            event.preventDefault();
            if (writable && draft.trim() && !send.isPending) send.mutate(draft);
          }}
        >
          {!writable ? (
            <div className="readonly-composer">
              <FiLock aria-hidden="true" />
              <p id="reply-reason">{reason}</p>
              <textarea
                className="sr-only"
                id="reply"
                aria-label={`Reply to ${ticket.customer.name}`}
                disabled
                value={draft}
                readOnly
              />
            </div>
          ) : (
            <>
              <label className="sr-only" htmlFor="reply">
                Reply to {ticket.customer.name}
              </label>
              <textarea
                id="reply"
                rows={2}
                maxLength={2000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={send.isPending}
                placeholder={`Write a message to ${ticket.customer.name}…`}
              />
              <FormError error={send.error} />
              <div className="composer-actions">
                <span className="muted">{draft.length} / 2,000 characters</span>
                <span className="composer-limit muted">Plain text only</span>
                <Button
                  variant="ghost"
                  className="chat-latest"
                  aria-label="Latest messages"
                  title="Latest messages"
                  onClick={() => {
                    if (scroll.current)
                      scroll.current.scrollTop = scroll.current.scrollHeight;
                    stick.current = true;
                  }}
                >
                  <FiArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="submit"
                  disabled={!draft.trim() || send.isPending}
                >
                  {send.isPending ? "Sending…" : "Send message"}
                  <FiSend aria-hidden="true" />
                </Button>
              </div>
            </>
          )}
        </form>
      </div>
      <aside className="ticket-details" aria-label="Ticket details">
        <div className="ticket-details-heading">
          <h2>Report context</h2>
          <FiInfo aria-hidden="true" />
        </div>
        <div className="ticket-context-scroll">
          <section className="ticket-context-section">
            <h3>Report journey</h3>
            <ol className="report-journey">
              {[
                { label: "Submitted", date: ticket.createdAt },
                { label: "In progress", date: ticket.claimedAt },
                { label: "Resolved", date: ticket.resolvedAt },
              ].map((step) => (
                <li
                  key={step.label}
                  className={`${step.date ? "journey-complete" : ""} ${step.label === (ticket.status === "InProgress" ? "In progress" : ticket.status) ? "journey-current" : ""}`}
                >
                  <strong>{step.label}</strong>
                  <span>
                    {step.date
                      ? compactDate(step.date)
                      : step.label === "In progress"
                        ? "Pending staff assignment"
                        : "Pending outcome"}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          {isUnassigned && (
            <section className="ticket-context-section">
              <h3>Assignment</h3>
              <div className="ticket-context-card assignment-card">
                <strong>Unassigned</strong>
                <p>Awaiting staff handler</p>
              </div>
            </section>
          )}
          <section className="ticket-context-section">
            <h3>Customer info</h3>
            <div className="ticket-context-card">
              <strong>{ticket.customer.name}</strong>
              <p className="muted">Customer</p>
              <a href={`mailto:${ticket.customer.email}`}>
                {ticket.customer.email}
              </a>
            </div>
          </section>
          <section className="ticket-context-section">
            <h3>Location</h3>
            <div className="ticket-context-card">
              <p>{addressText(ticket)}</p>
              <div className="coordinate-details">
                <span className="muted">Coordinates</span>
                <p>
                  {ticket.latitude.toFixed(3)}° N, {ticket.longitude.toFixed(3)}
                  ° E
                </p>
              </div>
            </div>
          </section>
          {ticket.assignedStaff && (
            <section className="ticket-context-section">
              <h3>Assigned handler</h3>
              <div className="ticket-context-card handler-card">
                <Avatar name={ticket.assignedStaff.name} />
                <div>
                  <strong>{ticket.assignedStaff.name}</strong>
                  <p>
                    Staff
                    {ticket.assignedStaff.id === account.id ? " · You" : ""}
                  </p>
                </div>
              </div>
            </section>
          )}
          {ticket.claimedAt && (
            <section className="ticket-context-section">
              <h3>Claimed</h3>
              <div className="ticket-context-card">
                {timestamp(ticket.claimedAt)}
              </div>
            </section>
          )}
          <section className="ticket-context-section">
            <h3>Report reference</h3>
            <div className="ticket-context-card ticket-full-reference">
              {ticket.id}
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
