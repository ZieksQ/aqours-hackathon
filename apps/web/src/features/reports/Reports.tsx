import {
  Alert,
  Badge,
  Button,
  MetricStrip,
  PageHeader,
  StatePanel,
  buttonClassName,
} from "@aqours/ui";
import {
  FiArrowDown,
  FiArrowLeft,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiFilter,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiUserCheck,
  FiWifi,
  FiWifiOff,
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
  reportReference,
  timestamp,
  type History,
  type Ticket,
} from "./api";
import { useReportConnection } from "./realtime";
import { StatusBadge, PriorityBadge } from "./ReportPresentation";
import "./reports.css";

const tabs = [
  ["unassigned", "Unassigned"],
  ["mine", "Mine"],
  ["in-progress", "In progress"],
  ["all", "All"],
];

export function Reports({ account }: { account: Account }) {
  const id = useParams()["*"] || undefined;
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const tab = params.get("tab") ?? "unassigned";
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const queue = useQuery({
    queryKey: ["reports", "queue", query],
    queryFn: () => fetchQueue(query),
  });
  const overview = useQuery({
    queryKey: ["reports", "overview"],
    queryFn: fetchOverview,
    enabled: !id,
  });
  const visibleTabs = tabs.filter(
    ([value]) => account.role === "Staff" || value !== "mine",
  );
  const ticket = useQuery({
    queryKey: ["reports", "ticket", id],
    queryFn: () => api<Ticket>(`/staff/reports/${id}`),
    enabled: !!id,
  });
  const realtime = useReportConnection(id);
  const [panel, setPanel] = useState("conversation");
  const client = useQueryClient();
  const [claimNotice, setClaimNotice] = useState("");
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
  const pager = (
    <div className="report-pagination">
      <span>
        {queue.data
          ? `Showing ${queue.data.items.length ? (page - 1) * queue.data.pageSize + 1 : 0}–${queue.data.items.length ? (page - 1) * queue.data.pageSize + queue.data.items.length : 0} of ${queue.data.totalCount} reports`
          : "Loading reports…"}
      </span>
      <div>
        <Button
          variant="secondary"
          disabled={page <= 1 || queue.isFetching}
          onClick={() => update({ page: String(page - 1) })}
        >
          <FiChevronLeft aria-hidden="true" /> Previous
        </Button>
        <Button
          variant="secondary"
          disabled={
            !queue.data ||
            page * queue.data.pageSize >= queue.data.totalCount ||
            queue.isFetching
          }
          onClick={() => update({ page: String(page + 1) })}
        >
          Next <FiChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
  const claimButton = (t: Ticket) =>
    account.role === "Staff" && t.status === "Submitted" && !t.assignedStaff ? (
      <Button
        variant="primary"
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
  return (
    <section className={`reports ${id ? "reports-workspace" : ""}`}>
      <PageHeader
        title={id ? "Ticket workspace" : "Reports"}
        description={
          id
            ? "Customer issue, conversation, and response."
            : "Review water issues and take the next report."
        }
        back={
          id && (
            <Link
              className="back-link"
              to={`/reports${query ? `?${query}` : ""}`}
            >
              <FiArrowLeft aria-hidden="true" />
              Report queue
            </Link>
          )
        }
        actions={
          <div className="report-connection">
            <span role="status" className="connection-status">
              {realtime.state === "Connected" ? (
                <FiWifi aria-hidden="true" />
              ) : (
                <FiWifiOff aria-hidden="true" />
              )}
              {realtime.state === "Connected"
                ? "Live updates connected"
                : realtime.state === "Connecting"
                  ? "Connecting updates…"
                  : "Live updates delayed"}
            </span>
            {realtime.state !== "Connected" &&
              realtime.state !== "Connecting" && (
                <Button variant="ghost" onClick={realtime.retry}>
                  Reconnect
                </Button>
              )}
            <Button
              variant="secondary"
              onClick={() =>
                void client.invalidateQueries({ queryKey: ["reports"] })
              }
            >
              <FiRefreshCw aria-hidden="true" />
              Refresh
            </Button>
          </div>
        }
      />
      {claimNotice && <Alert>{claimNotice}</Alert>}
      {!claimNotice && <FormError error={claim.error} />}
      {!id ? (
        <>
          <p className="summary-scope muted">
            Organization-wide reports · All service areas
          </p>
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
          {overview.data && (
            <p className="queue-priority-note">
              <Badge
                tone={overview.data.summary.highPriority ? "danger" : "neutral"}
              >
                {overview.data.summary.highPriority} unresolved High-priority
                reports
              </Badge>
            </p>
          )}
          <nav className="report-tabs" aria-label="Report views">
            {visibleTabs.map(([value, label]) => (
              <Button
                variant="ghost"
                key={value}
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
                {label}
              </Button>
            ))}
          </nav>
          <form
            className="report-search"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              update({ search: String(form.get("search") ?? "") });
            }}
          >
            <label htmlFor="report-search" className="sr-only">
              Search reports
            </label>
            <input
              key={params.get("search")}
              id="report-search"
              name="search"
              defaultValue={params.get("search") ?? ""}
              placeholder="Search ticket ID, issue, customer or address"
              maxLength={200}
            />
            <Button
              type="submit"
              variant="secondary"
              className="report-search-submit"
              aria-label="Search reports"
            >
              <FiSearch aria-hidden="true" />
              <span>Search</span>
            </Button>
            <details className="report-filters">
              <summary>
                <FiFilter aria-hidden="true" />
                Filters
              </summary>
              <div>
                {[
                  [
                    "status",
                    "Status",
                    [
                      ["Submitted", "Submitted"],
                      ["InProgress", "In progress"],
                      ["Resolved", "Resolved"],
                    ],
                  ],
                  [
                    "priority",
                    "Priority",
                    [
                      ["Low", "Low"],
                      ["Normal", "Normal"],
                      ["High", "High"],
                    ],
                  ],
                  [
                    "assignment",
                    "Assignment",
                    [
                      ["unassigned", "Unassigned"],
                      ["mine", "Assigned to me"],
                      ["assigned", "Assigned"],
                    ],
                  ],
                ].map(([key, label, options]) => (
                  <label key={String(key)}>
                    {String(label)}
                    <select
                      value={params.get(String(key)) ?? ""}
                      onChange={(event) =>
                        update({ [String(key)]: event.target.value })
                      }
                    >
                      <option value="">Any</option>
                      {(options as string[][]).map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setParams({ tab })}
                >
                  Clear filters
                </Button>
              </div>
            </details>
          </form>
          {queue.isPending ? (
            <div className="report-loading" role="status">
              Loading report queue…
              {Array.from({ length: 5 }, (_, i) => (
                <div className="report-skeleton" key={i} />
              ))}
            </div>
          ) : queue.isError ? (
            <LoadError error={queue.error} retry={() => void queue.refetch()} />
          ) : (
            <>
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Ticket / issue</th>
                      <th>Customer / location</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Handler</th>
                      <th>Submitted</th>
                      <th>
                        <span className="sr-only">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.data.items.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <Link
                            to={link(t.id)}
                            onClick={() => setPanel("conversation")}
                          >
                            {t.title}
                          </Link>
                          <span className="report-id" title={t.id}>
                            {reportReference(t.id)}
                          </span>
                        </td>
                        <td>
                          <span>{t.customer.name}</span>
                          <span className="muted report-subline">
                            {t.address.barangayName},{" "}
                            {t.address.cityMunicipalityName}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={t.status} />
                        </td>
                        <td>
                          <PriorityBadge priority={t.priority} />
                        </td>
                        <td>
                          <span
                            className={`report-handler${!t.assignedStaff ? " muted" : ""}`}
                          >
                            {t.assignedStaff?.name ?? "Unassigned"}
                            {t.assignedStaff?.id === account.id && (
                              <Badge>You</Badge>
                            )}
                          </span>
                        </td>
                        <td>
                          <time dateTime={t.createdAt}>
                            {timestamp(t.createdAt)}
                          </time>
                        </td>
                        <td className="report-row-action">
                          {claimButton(t) ?? (
                            <Link
                              className={buttonClassName(
                                "secondary",
                                "report-action",
                              )}
                              to={link(t.id)}
                              onClick={() => setPanel("conversation")}
                            >
                              Open ticket
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
              {pager}
            </>
          )}
        </>
      ) : (
        <>
          <div className="workspace-switch">
            <Button
              variant="ghost"
              aria-pressed={panel === "list"}
              onClick={() =>
                setPanel(panel === "list" ? "conversation" : "list")
              }
            >
              Ticket list
            </Button>
            <Button
              variant="ghost"
              aria-pressed={panel === "conversation"}
              onClick={() => setPanel("conversation")}
            >
              Conversation
            </Button>
            <Button
              variant="ghost"
              aria-pressed={panel === "details"}
              onClick={() =>
                setPanel(panel === "details" ? "conversation" : "details")
              }
            >
              Details
            </Button>
          </div>
          <div className={`workspace-grid show-${panel}`}>
            <aside
              className="ticket-list"
              aria-label="Tickets in current queue"
            >
              <div className="ticket-list-heading">
                <h2>
                  {tabs.find(([value]) => value === tab)?.[1] ?? "Reports"}
                </h2>
                <Link to={`/reports${query ? `?${query}` : ""}`}>
                  Edit filters
                </Link>
              </div>
              {queue.isPending ? (
                <p role="status">Loading tickets…</p>
              ) : queue.isError ? (
                <LoadError
                  error={queue.error}
                  retry={() => void queue.refetch()}
                />
              ) : (
                <>
                  {queue.data.items.map((t) => (
                    <Link
                      aria-current={id === t.id ? "page" : undefined}
                      className="ticket-list-row"
                      key={t.id}
                      to={link(t.id)}
                      onClick={() => setPanel("conversation")}
                    >
                      <strong>{t.title}</strong>
                      <span>{t.customer.name}</span>
                      <span className="report-id" title={t.id}>
                        {reportReference(t.id)} ·{" "}
                        {new Date(t.createdAt).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className="ticket-list-badges">
                        <StatusBadge status={t.status} />
                        <PriorityBadge priority={t.priority} />
                      </span>
                      <span className="muted">
                        {t.assignedStaff?.name ?? "Unassigned"}
                      </span>
                    </Link>
                  ))}
                  {!queue.data.items.length && (
                    <p className="report-empty">
                      No tickets match this queue.{" "}
                      <Link to="/reports?tab=all">View all reports</Link>
                    </p>
                  )}
                  {pager}
                </>
              )}
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
                  claimButton={claimButton(ticket.data)}
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
          <FiRefreshCw aria-hidden="true" />
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
  return (
    <>
      <div className="conversation">
        <header className="conversation-header">
          <div className="conversation-title">
            <h2>{ticket.title}</h2>
            <span className="report-id report-id-full">{ticket.id}</span>
          </div>
          <div className="ticket-toolbar">
            <StatusBadge status={ticket.status} />
            <div className="ticket-priority-control">
              <label htmlFor="ticket-priority">Priority</label>
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
            {claimButton}
            {writable && (
              <Button
                variant="secondary"
                className="ticket-resolve"
                disabled={change.isPending || resolveConfirm}
                onClick={() => setResolveConfirm(true)}
              >
                <FiCheck aria-hidden="true" />
                Resolve ticket
              </Button>
            )}
          </div>
          {resolveConfirm && writable && (
            <div
              className="resolve-confirm"
              role="group"
              aria-label="Confirm ticket resolution"
            >
              <p>
                Resolve this ticket? The conversation will become read-only.
              </p>
              <div className="resolve-confirm-actions">
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
        </header>
        <div
          className="conversation-history"
          ref={scroll}
          onScroll={(event) => {
            const node = event.currentTarget;
            stick.current =
              node.scrollHeight - node.scrollTop - node.clientHeight < 80;
          }}
        >
          <article className="initial-report">
            <div className="message-meta">
              <strong>{ticket.customer.name}</strong>
              <span>Customer · initial report</span>
              <time dateTime={ticket.createdAt}>
                {timestamp(ticket.createdAt)}
              </time>
            </div>
            <p>{ticket.description}</p>
            <div className="initial-location muted">{addressText(ticket)}</div>
          </article>
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
          {history.isPending && <p role="status">Loading conversation…</p>}
          {history.isError && (
            <LoadError
              error={history.error}
              retry={() => void history.refetch()}
            />
          )}
          {messages.map((message) => (
            <article
              className={`report-message ${message.senderId === account.id ? "message-own" : ""}`}
              key={message.id}
            >
              <div className="message-meta">
                <strong>{message.senderName}</strong>
                <span>{message.senderRole}</span>
                <time dateTime={message.createdAt}>
                  {timestamp(message.createdAt)}
                </time>
              </div>
              <p>{message.body}</p>
            </article>
          ))}
          {!history.isPending && !history.isError && !messages.length && (
            <p className="muted report-empty">No messages yet.</p>
          )}
        </div>
        <form
          className="report-composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (writable && draft.trim() && !send.isPending) send.mutate(draft);
          }}
        >
          {reason && (
            <p className="muted" id="reply-reason">
              {reason}
            </p>
          )}
          <label htmlFor="reply">Reply to {ticket.customer.name}</label>
          <textarea
            id="reply"
            rows={3}
            maxLength={2000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!writable || send.isPending}
            aria-describedby={reason ? "reply-reason" : undefined}
            placeholder={
              writable ? "Write a message…" : "Conversation is read-only"
            }
          />
          <FormError error={send.error} />
          <div className="composer-actions">
            <span className="muted">{draft.length}/2,000</span>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                if (scroll.current)
                  scroll.current.scrollTop = scroll.current.scrollHeight;
                stick.current = true;
              }}
            >
              Latest messages <FiArrowDown aria-hidden="true" />
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!writable || !draft.trim() || send.isPending}
            >
              <FiSend aria-hidden="true" />
              {send.isPending ? "Sending…" : "Send message"}
            </Button>
          </div>
        </form>
      </div>
      <aside className="ticket-details" aria-label="Ticket details">
        <h2>Report details</h2>
        <h3>Report journey</h3>
        <ol className="report-journey">
          {[
            { label: "Submitted", date: ticket.createdAt },
            { label: "In progress", date: ticket.claimedAt },
            { label: "Resolved", date: ticket.resolvedAt },
          ].map((step) => (
            <li
              key={step.label}
              className={step.date ? "journey-complete" : ""}
            >
              <span>{step.label}</span>
              <span className="muted report-subline">
                {step.date ? timestamp(step.date) : "Pending"}
              </span>
            </li>
          ))}
        </ol>
        <dl>
          <dt>Customer</dt>
          <dd>
            {ticket.customer.name}
            <a href={`mailto:${ticket.customer.email}`}>
              {ticket.customer.email}
            </a>
          </dd>
          <dt>Supplier</dt>
          <dd>{ticket.supplierName}</dd>
          <dt>Handler</dt>
          <dd>
            <span className="report-handler">
              {ticket.assignedStaff?.name ?? "Unassigned"}
              {ticket.assignedStaff?.id === account.id && <Badge>You</Badge>}
            </span>
            {ticket.claimedAt && (
              <span className="muted report-subline">
                Claimed {timestamp(ticket.claimedAt)}
              </span>
            )}
          </dd>
          <dt>Priority</dt>
          <dd>
            <PriorityBadge priority={ticket.priority} />
          </dd>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={ticket.status} />
          </dd>
          <dt>Address</dt>
          <dd>{addressText(ticket)}</dd>
          <dt>Coordinates</dt>
          <dd>
            {ticket.latitude}, {ticket.longitude}
          </dd>
          <dt>Full description</dt>
          <dd className="report-description">{ticket.description}</dd>
        </dl>
      </aside>
    </>
  );
}
