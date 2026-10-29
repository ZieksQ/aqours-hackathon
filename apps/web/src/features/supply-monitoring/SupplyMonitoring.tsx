import { useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  PageHeader,
  Pagination,
  StatePanel,
  Table,
  buttonClassName,
} from "@aqours/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FiArrowLeft,
  FiCheck,
  FiInfo,
  FiMapPin,
  FiPlus,
  FiRefreshCw,
  FiUser,
} from "react-icons/fi";
import { Link, Route, Routes, useParams, useSearchParams } from "react-router";
import { ApiError, type Account } from "../accounts/api";
import { siteAddress } from "../supply-sites/api";
import {
  listMonitoredSites,
  listSupplyReadings,
  readMonitoredSite,
  readingTime,
  recordSupplyReading,
  type MonitoredSite,
  type SupplyReading,
  type SupplyStatus,
} from "./api";
import "./supply-monitoring.css";

export function SupplyMonitoring({ account }: { account: Account }) {
  return (
    <Routes>
      <Route index element={<Directory account={account} />} />
      <Route path=":id" element={<History account={account} />} />
      <Route
        path="*"
        element={
          <StatePanel
            title="Page unavailable"
            action={
              <Link to="/supply-monitoring">Back to supply monitoring</Link>
            }
          />
        }
      />
    </Routes>
  );
}
function Status({ reading }: { reading: SupplyReading | null }) {
  return (
    <Badge
      tone={
        reading?.status === "Normal"
          ? "success"
          : reading?.status === "Low"
            ? "warning"
            : reading?.status === "Unavailable"
              ? "danger"
              : "neutral"
      }
    >
      {reading?.status ?? "Not recorded"}
    </Badge>
  );
}
function Time({ reading }: { reading: SupplyReading | null }) {
  return reading ? (
    <time dateTime={reading.updatedAt}>{readingTime(reading.updatedAt)}</time>
  ) : (
    <span className="muted">—</span>
  );
}
function usePaging() {
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const size = Number(params.get("pageSize") ?? 20);
  const pageSize = [20, 50, 100].includes(size) ? size : 20;
  return {
    page,
    pageSize,
    onChange: (next: number) =>
      setParams({ page: String(next), pageSize: String(pageSize) }),
    onPageSizeChange: (next: number) =>
      setParams({ page: "1", pageSize: String(next) }),
  };
}
function ReadError({ error, retry }: { error: Error; retry: () => void }) {
  const missing = error instanceof ApiError && error.status === 404;
  return (
    <StatePanel
      title={
        missing ? "Supply site unavailable" : "Could not load supply readings"
      }
      role="alert"
      action={
        missing ? (
          <Link to="/supply-monitoring">Back to supply monitoring</Link>
        ) : (
          <Button variant="secondary" onClick={retry}>
            Retry
          </Button>
        )
      }
    >
      {missing
        ? "This site could not be found. Choose another site from the directory."
        : error.message}
    </StatePanel>
  );
}
function Directory({ account }: { account: Account }) {
  const paging = usePaging();
  const sites = useQuery({
    queryKey: ["supply-monitoring", "sites", paging.page, paging.pageSize],
    queryFn: () => listMonitoredSites(paging.page, paging.pageSize),
  });
  const [selected, setSelected] = useState<MonitoredSite | null>(null);
  const [notice, setNotice] = useState("");
  return (
    <section className="supply-monitoring monitoring-directory">
      <PageHeader
        title="Supply monitoring"
        description="Manually recorded supply availability across supplier sites."
        actions={
          <Button
            variant="secondary"
            disabled={sites.isFetching}
            onClick={() => void sites.refetch()}
          >
            <FiRefreshCw aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      {notice && <Alert tone="success">{notice}</Alert>}
      {account.role === "Admin" && (
        <p className="monitoring-role-note">
          <FiInfo aria-hidden="true" />
          Only Staff can record supply readings.
        </p>
      )}
      <div className="monitoring-table-panel">
        <Table
          label="Supply monitoring directory"
          className="monitoring-directory-table"
        >
          <thead>
            <tr>
              <th>Site name</th>
              <th>Address</th>
              <th>Supply status</th>
              <th>Recorded by</th>
              <th>Last recorded</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sites.data?.items.map((site) => (
              <tr key={site.id}>
                <td>
                  <Link
                    className="monitoring-site-name"
                    to={`/supply-monitoring/${site.id}`}
                  >
                    {site.name}
                  </Link>
                </td>
                <td className="monitoring-address">
                  {siteAddress(site.address)}
                </td>
                <td data-label="Supply status">
                  <Status reading={site.latestSupply} />
                </td>
                <td data-label="Recorded by">
                  {site.latestSupply?.updatedBy.name ?? "—"}
                </td>
                <td data-label="Last recorded">
                  <Time reading={site.latestSupply} />
                </td>
                <td>
                  <div className="monitoring-row-actions">
                    {account.role === "Staff" && (
                      <Button
                        onClick={() => {
                          setNotice("");
                          setSelected(site);
                        }}
                        aria-label={`Record reading for ${site.name}`}
                      >
                        Record reading
                      </Button>
                    )}
                    <Link
                      className={buttonClassName("secondary")}
                      to={`/supply-monitoring/${site.id}`}
                      aria-label={`View history for ${site.name}`}
                    >
                      View history
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {sites.isPending && (
          <StatePanel title="Loading supply sites…" role="status" />
        )}
        {sites.isError && (
          <ReadError error={sites.error} retry={() => void sites.refetch()} />
        )}
        {sites.data && !sites.data.items.length && (
          <StatePanel
            title={
              sites.data.totalCount
                ? "No sites on this page"
                : "No supply sites yet"
            }
            action={
              sites.data.totalCount ? (
                <Button variant="secondary" onClick={() => paging.onChange(1)}>
                  Return to first page
                </Button>
              ) : undefined
            }
          >
            Supply sites added by an administrator will appear here.
          </StatePanel>
        )}
        {sites.data && (
          <Pagination
            {...paging}
            total={sites.data.totalCount}
            count={sites.data.items.length}
            noun="supply sites"
            compact
            disabled={sites.isFetching}
          />
        )}
      </div>
      <p className="monitoring-footnote">
        <FiInfo aria-hidden="true" />
        Times shown in Asia/Manila (PHT). Supply readings are entered manually,
        not live sensor data.
      </p>
      {selected && (
        <RecordDialog
          site={selected}
          account={account}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            setNotice("Supply reading recorded");
          }}
        />
      )}
    </section>
  );
}
function History({ account }: { account: Account }) {
  const { id = "" } = useParams();
  const paging = usePaging();
  const site = useQuery({
    queryKey: ["supply-monitoring", "site", id],
    queryFn: () => readMonitoredSite(id),
  });
  const history = useQuery({
    queryKey: [
      "supply-monitoring",
      "history",
      id,
      paging.page,
      paging.pageSize,
    ],
    queryFn: () => listSupplyReadings(id, paging.page, paging.pageSize),
    enabled: !!site.data,
  });
  const [record, setRecord] = useState(false);
  const [notice, setNotice] = useState("");
  const refresh = () => {
    void site.refetch();
    void history.refetch();
  };
  const first = site.data?.latestSupply === null;
  return (
    <section className="supply-monitoring monitoring-history">
      <PageHeader
        title={
          site.data ? `${site.data.name} — Supply history` : "Supply history"
        }
        back={
          <Link to="/supply-monitoring" className="back-link">
            <FiArrowLeft aria-hidden="true" />
            Back to supply monitoring
          </Link>
        }
        actions={
          site.data && (
            <>
              <Button
                variant="secondary"
                disabled={site.isFetching || history.isFetching}
                onClick={refresh}
              >
                <FiRefreshCw aria-hidden="true" />
                Refresh
              </Button>
              {account.role === "Staff" && !first && (
                <Button
                  onClick={() => {
                    setNotice("");
                    setRecord(true);
                  }}
                >
                  <FiPlus aria-hidden="true" />
                  Record reading
                </Button>
              )}
            </>
          )
        }
      />
      {notice && <Alert tone="success">{notice}</Alert>}
      {site.isPending && (
        <StatePanel title="Loading supply site…" role="status" />
      )}
      {site.isError && (
        <ReadError error={site.error} retry={() => void site.refetch()} />
      )}
      {site.data && (
        <>
          <div className="monitoring-location">
            <FiMapPin aria-hidden="true" />
            <p>
              <strong>Facility location:</strong>{" "}
              {siteAddress(site.data.address)}
            </p>
          </div>
          {account.role === "Admin" && (
            <p className="monitoring-role-note">
              <FiInfo aria-hidden="true" />
              Only Staff can record supply readings.
            </p>
          )}
          <section
            className={`monitoring-latest monitoring-latest-${site.data.latestSupply?.status ?? "empty"}`}
            aria-label="Latest manual reading"
          >
            <h2>Latest manual reading</h2>
            <p className="muted">Manually recorded supply availability.</p>
            <dl>
              <div>
                <dt>Supply status</dt>
                <dd>
                  <Status reading={site.data.latestSupply} />
                </dd>
              </div>
              <div>
                <dt>Recorded by</dt>
                <dd>{site.data.latestSupply?.updatedBy.name ?? "—"}</dd>
              </div>
              <div>
                <dt>Last recorded</dt>
                <dd>
                  <Time reading={site.data.latestSupply} />
                </dd>
              </div>
            </dl>
          </section>
          <div className="monitoring-history-heading">
            <div>
              <h2>Reading history</h2>
              <p className="muted">
                Permanent manual supply records. Recording the same status adds
                a new entry.
              </p>
            </div>
            {history.data && (
              <span className="muted">
                {history.data.totalCount}{" "}
                {history.data.totalCount === 1 ? "reading" : "readings"}
              </span>
            )}
          </div>
          <div className="monitoring-table-panel">
            <Table
              label="Supply reading history"
              className="monitoring-history-table"
            >
              <thead>
                <tr>
                  <th>Supply status</th>
                  <th>Recorded by</th>
                  <th>Last recorded</th>
                </tr>
              </thead>
              <tbody>
                {history.data?.items.map((reading) => (
                  <tr key={reading.id}>
                    <td data-label="Supply status">
                      <Status reading={reading} />
                    </td>
                    <td data-label="Recorded by">{reading.updatedBy.name}</td>
                    <td data-label="Last recorded">
                      <Time reading={reading} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {history.isPending && (
              <StatePanel title="Loading reading history…" role="status" />
            )}
            {history.isError && (
              <ReadError
                error={history.error}
                retry={() => void history.refetch()}
              />
            )}
            {history.data && !history.data.items.length && (
              <StatePanel
                title={
                  history.data.totalCount
                    ? "No readings on this page"
                    : "No supply readings yet."
                }
                action={
                  history.data.totalCount ? (
                    <Button
                      variant="secondary"
                      onClick={() => paging.onChange(1)}
                    >
                      Return to first page
                    </Button>
                  ) : (
                    account.role === "Staff" && (
                      <Button onClick={() => setRecord(true)}>
                        <FiPlus aria-hidden="true" />
                        Record first reading
                      </Button>
                    )
                  )
                }
              >
                {history.data.totalCount
                  ? "Choose another page to view readings."
                  : "No manual supply reading has been recorded for this site."}
              </StatePanel>
            )}
            {history.data && (
              <Pagination
                {...paging}
                total={history.data.totalCount}
                count={history.data.items.length}
                noun={history.data.totalCount === 1 ? "reading" : "readings"}
                compact
                disabled={history.isFetching}
              />
            )}
          </div>
          <p className="monitoring-footnote">
            Times shown in Asia/Manila (PHT).
          </p>
          {record && account.role === "Staff" && (
            <RecordDialog
              key={id}
              site={site.data}
              account={account}
              onClose={() => setRecord(false)}
              onSaved={() => {
                setRecord(false);
                paging.onChange(1);
                setNotice("Supply reading recorded");
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
function RecordDialog({
  site,
  account,
  onClose,
  onSaved,
}: {
  site: MonitoredSite;
  account: Account;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<SupplyStatus | null>(null);
  const [invalid, setInvalid] = useState(false);
  const submitting = useRef(false);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (value: SupplyStatus) => recordSupplyReading(site.id, value),
    onSuccess: (reading) => {
      // Use the server attribution/time immediately, then refresh authoritative latest and history.
      client.setQueryData<MonitoredSite>(
        ["supply-monitoring", "site", site.id],
        (old) => (old ? { ...old, latestSupply: reading } : undefined),
      );
      void client.invalidateQueries({ queryKey: ["supply-monitoring"] });
      onSaved();
    },
    onSettled: () => {
      submitting.current = false;
    },
  });
  return (
    <Dialog
      title="Record supply reading"
      titleId="record-supply-title"
      description={site.name}
      onClose={onClose}
      busy={save.isPending}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!status) {
            setInvalid(true);
            return;
          }
          if (submitting.current) return;
          submitting.current = true;
          save.mutate(status);
        }}
      >
        <div className="monitoring-dialog-body">
          <div className="monitoring-context">
            <p className="monitoring-location">
              <FiMapPin aria-hidden="true" />
              {siteAddress(site.address)}
            </p>
            <div className="monitoring-current">
              <span className="muted">Current status:</span>{" "}
              <Status reading={site.latestSupply} />
              {site.latestSupply && (
                <span>
                  Recorded by {site.latestSupply.updatedBy.name} on{" "}
                  {readingTime(site.latestSupply.updatedAt)}
                </span>
              )}
            </div>
          </div>
          <fieldset
            disabled={save.isPending}
            aria-describedby={invalid ? "supply-choice-error" : undefined}
            aria-invalid={invalid}
          >
            <legend>
              Supply status <span aria-hidden="true">*</span>
            </legend>
            {(["Normal", "Low", "Unavailable"] as const).map((value) => (
              <label className="monitoring-choice" key={value}>
                <input
                  type="radio"
                  required
                  name="supply-status"
                  value={value}
                  checked={status === value}
                  onChange={() => {
                    setStatus(value);
                    setInvalid(false);
                  }}
                />
                {value}
              </label>
            ))}
          </fieldset>
          {invalid && (
            <p
              className="monitoring-validation"
              id="supply-choice-error"
              role="alert"
            >
              Select a supply status before saving.
            </p>
          )}
          <div className="monitoring-attribution">
            <p>
              <FiUser aria-hidden="true" />
              Recorded as {account.firstName} {account.lastName}
            </p>
            <p>Recording time is set when you save.</p>
            <p>Recording the same status adds a new history entry.</p>
          </div>
          {save.isError && (
            <Alert tone="error">
              {save.error instanceof ApiError &&
              [403, 404].includes(save.error.status)
                ? save.error.status === 404
                  ? "This site is no longer available. Close this dialog and refresh the directory."
                  : save.error.message
                : "We couldn't save this reading. Your selection is kept. Try again."}
            </Alert>
          )}
        </div>
        <div className="monitoring-dialog-actions">
          <Button
            variant="secondary"
            disabled={save.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            <FiCheck aria-hidden="true" />
            {save.isPending ? "Saving…" : "Save reading"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
