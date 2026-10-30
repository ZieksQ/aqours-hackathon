import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Route, Routes, useParams } from "react-router";
import {
  Alert,
  Badge,
  Button,
  Field,
  MetricStrip,
  PageHeader,
  SectionPanel,
  StatePanel,
  Table,
  buttonClassName,
} from "@aqours/ui";
import { FiRefreshCw, FiSliders } from "react-icons/fi";
import {
  CartesianGrid,
  Area,
  AreaChart,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";
import type { Account } from "../accounts/api";
import { FormError } from "../../shared/FormError";
import { readingTime } from "../supply-monitoring/api";
import {
  condition,
  dayLabel,
  limited,
  listWeather,
  readSettings,
  readWeather,
  risk,
  saveSettings,
  temperature,
  type WeatherSite,
} from "./api";
import { WeatherMap } from "./WeatherMap";
import "./weather.css";
const stamp = (value: string | null) =>
  value ? readingTime(value) : "Not recorded";
function Status({ site }: { site: WeatherSite }) {
  return (
    <Badge
      tone={
        site.latestSupplyStatus === "Unavailable"
          ? "danger"
          : risk(site)
            ? "warning"
            : limited(site)
              ? "neutral"
              : "success"
      }
    >
      {condition(site)}
    </Badge>
  );
}
function Forecast({ site }: { site: WeatherSite }) {
  const data = site.days.map((day) => ({ ...day, label: dayLabel(day.date) }));
  return (
    <>
      <div
        className="weather-chart"
        role="img"
        aria-label={`${site.name} forecast. Demo threshold ${site.heatThresholdCelsius} degrees Celsius. Values listed below.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 20, right: 28, bottom: 10, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="#e6ebeb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              unit="°C"
              domain={[
                (min: number) =>
                  Math.floor(Math.min(min, site.heatThresholdCelsius) - 2),
                (max: number) =>
                  Math.ceil(Math.max(max, site.heatThresholdCelsius) + 2),
              ]}
              tick={{ fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value) =>
                temperature(typeof value === "number" ? value : null)
              }
            />
            <ReferenceLine
              y={site.heatThresholdCelsius}
              stroke="#b42332"
              strokeDasharray="4 4"
              label={{
                value: `Demo ${site.heatThresholdCelsius.toFixed(1)}°C`,
                position: "insideTopRight",
                fontSize: 12,
                fill: "#b42332",
              }}
            />
            <Area
              type="linear"
              fill="#166c80"
              fillOpacity={0.08}
              dataKey="maximumTemperatureCelsius"
              name="Daily maximum"
              stroke="#166c80"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "white" }}
              connectNulls={false}
            >
              <LabelList
                dataKey="maximumTemperatureCelsius"
                position="top"
                formatter={(value: unknown) =>
                  typeof value === "number" ? `${value.toFixed(1)}°C` : ""
                }
                fontSize={12}
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="weather-values">
        {site.days.map((day) => (
          <span key={day.date}>
            {dayLabel(day.date)}{" "}
            <strong>{temperature(day.maximumTemperatureCelsius)}</strong>
          </span>
        ))}
      </div>
      <p className="weather-note">
        Forecast retrieved: {stamp(site.forecastRetrievedAt)}
      </p>
    </>
  );
}
function Timeline({ site }: { site: WeatherSite }) {
  return (
    <>
      <div className="weather-timeline">
        {site.days.map((day) => (
          <div key={day.date}>
            <p className="muted">{dayLabel(day.date)}</p>
            <strong>{temperature(day.maximumTemperatureCelsius)}</strong>
            <p
              className={
                day.warningState === "PotentialSupplyRisk"
                  ? "weather-risk"
                  : "muted"
              }
            >
              {day.warningState === "Unknown"
                ? "Unknown"
                : day.warningState === "PotentialSupplyRisk"
                  ? "Potential supply risk"
                  : "No combined warning"}
            </p>
          </div>
        ))}
      </div>
      <div className="weather-reading">
        Latest manual supply:{" "}
        <strong>{site.latestSupplyStatus ?? "Not recorded"}</strong>
        <span>{stamp(site.latestSupplyAt)}</span>
        <Link to={`/supply-monitoring/${site.id}`}>View supply history →</Link>
      </div>
    </>
  );
}
function Attribution() {
  return (
    <footer className="weather-footer">
      <span>
        Weather forecasts by <a href="https://open-meteo.com/">Open-Meteo</a> ·
        CC BY 4.0
      </span>
      <span>Demo threshold, not an official danger level.</span>
    </footer>
  );
}
function Overview({ account }: { account: Account }) {
  const query = useQuery({
    queryKey: ["weather", "sites"],
    queryFn: ({ signal }) => listWeather(signal),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const sites = query.data ?? [];
  const chosen =
    sites.find((s) => s.id === selected) ?? sites.find(risk) ?? sites[0];
  const priority = sites.filter(risk);
  const filtered = sites.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "risk" && risk(s)) ||
        (filter === "limited" && limited(s)) ||
        (filter === "unavailable" && s.latestSupplyStatus === "Unavailable")),
  );
  const daily =
    sites[0]?.days.map((day) => ({
      label: dayLabel(day.date),
      count: sites.filter((site) =>
        site.days.some(
          (d) =>
            d.date === day.date && d.warningState === "PotentialSupplyRisk",
        ),
      ).length,
    })) ?? [];
  return (
    <section className="weather-page weather-overview">
      <PageHeader
        title="Weather monitoring"
        description="Three-day forecast temperatures and latest manual supply."
        actions={
          <>
            {account.role === "Admin" && (
              <Link
                className={buttonClassName("secondary")}
                to="/weather-monitoring/settings"
              >
                <FiSliders aria-hidden="true" />
                Threshold settings
                {chosen ? ` (${chosen.heatThresholdCelsius.toFixed(1)}°C)` : ""}
              </Link>
            )}
            <Button
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <FiRefreshCw aria-hidden="true" />
              {query.isFetching ? "Refreshing…" : "Refresh assessments"}
            </Button>
          </>
        }
      />
      <FormError error={query.error} />
      {query.data && (
        <p className="weather-note">
          Assessments loaded:{" "}
          {readingTime(new Date(query.dataUpdatedAt).toISOString())}.
        </p>
      )}
      {query.isPending ? (
        <StatePanel title="Loading weather assessments…" role="status" />
      ) : !sites.length ? (
        <StatePanel
          title={
            query.isError
              ? "Weather assessments unavailable"
              : "No monitored sites"
          }
          action={
            query.isError ? (
              <Button onClick={() => void query.refetch()}>Retry</Button>
            ) : account.role === "Admin" ? (
              <Link to="/supply-sites/new">Add a supply site</Link>
            ) : undefined
          }
        >
          Assessments appear when supplier sites are available.
        </StatePanel>
      ) : (
        <>
          <div className="weather-priority">
            <div>
              <strong>
                {priority.length}{" "}
                {priority.length === 1 ? "site needs" : "sites need"} a
                supply-risk review
              </strong>
              <p>
                Forecast above the demo threshold + Low supply. Confirm
                provisional evidence.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setFilter("risk");
                document
                  .getElementById("weather-sites")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Review priority sites
            </Button>
          </div>
          <MetricStrip
            label="Weather monitoring summary; counts overlap"
            items={[
              {
                label: "Monitored sites",
                value: sites.length,
                detail: "All supplier sites",
              },
              {
                label: "Potential supply risk",
                value: priority.length,
                detail: "Forecast heat + Low supply",
              },
              {
                label: "Unavailable supply",
                value: sites.filter(
                  (s) => s.latestSupplyStatus === "Unavailable",
                ).length,
                detail: "Manual supply observations",
              },
              {
                label: "Data limited",
                value: sites.filter(limited).length,
                detail: "Stale, missing or incomplete",
              },
            ]}
          />
          <div className="weather-main-grid">
            <SectionPanel
              title="Supply site area map"
              note={`${sites.length} sites`}
            >
              <WeatherMap sites={sites} onSelect={setSelected} />
            </SectionPanel>
            {chosen && (
              <SectionPanel
                title={`${chosen.name} — 3-day forecast`}
                note="Daily maximum temperature"
              >
                <Forecast site={chosen} />
                <Status site={chosen} />
                <Link
                  className="weather-detail-link"
                  to={`/weather-monitoring/${chosen.id}`}
                >
                  View assessment →
                </Link>
              </SectionPanel>
            )}
          </div>
          <div className="weather-secondary-grid">
            <SectionPanel
              title="Sites with potential supply risk by day"
              note="Daily count"
            >
              <div
                className="weather-bars"
                role="img"
                aria-label={daily
                  .map((d) => `${d.label}: ${d.count} sites`)
                  .join("; ")}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={daily}
                    layout="vertical"
                    margin={{ left: 6, right: 24, top: 8, bottom: 0 }}
                  >
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(1, max)]}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={70}
                      tick={{ fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      name="Sites"
                      fill="#166c80"
                      barSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="weather-note">
                Latest Low manual supply + forecast strictly above the demo
                threshold.
              </p>
            </SectionPanel>
            {chosen && (
              <SectionPanel
                title={`${chosen.name} timeline`}
                note={`Supply: ${chosen.latestSupplyStatus ?? "Not recorded"}`}
              >
                <Timeline site={chosen} />
              </SectionPanel>
            )}
          </div>
          <SectionPanel
            title="Site assessments"
            note={`${filtered.length} of ${sites.length} sites`}
            className="weather-site-panel"
          >
            <div className="weather-filters" id="weather-sites">
              <input
                aria-label="Filter station name"
                placeholder="Filter station name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Assessment status"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All assessments</option>
                <option value="risk">Potential supply risk</option>
                <option value="unavailable">Unavailable supply</option>
                <option value="limited">Data limited</option>
              </select>
            </div>
            <Table label="Site weather assessments">
              <thead>
                <tr>
                  <th>Site facility</th>
                  <th>Recorded supply</th>
                  {sites[0]?.days.map((d) => (
                    <th key={d.date}>{dayLabel(d.date)}</th>
                  ))}
                  <th>Assessment condition</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((site) => (
                  <tr key={site.id}>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() => setSelected(site.id)}
                      >
                        {site.name}
                      </Button>
                    </td>
                    <td>
                      {site.latestSupplyStatus ?? "Not recorded"}
                      <small>{stamp(site.latestSupplyAt)}</small>
                    </td>
                    {site.days.map((day) => (
                      <td
                        key={day.date}
                        className={
                          day.warningState === "PotentialSupplyRisk"
                            ? "weather-risk"
                            : ""
                        }
                      >
                        {temperature(day.maximumTemperatureCelsius)}
                      </td>
                    ))}
                    <td>
                      <Status site={site} />
                    </td>
                    <td>
                      <Link to={`/weather-monitoring/${site.id}`}>
                        View assessment →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {!filtered.length && (
              <p className="weather-empty">No sites match these filters.</p>
            )}
            <div className="weather-mobile-sites">
              {filtered.map((site) => (
                <article key={site.id}>
                  <Link to={`/weather-monitoring/${site.id}`}>
                    {site.name} →
                  </Link>
                  <Status site={site} />
                  <p>
                    Manual supply: {site.latestSupplyStatus ?? "Not recorded"} ·{" "}
                    {stamp(site.latestSupplyAt)}
                  </p>
                  <div className="weather-values">
                    {site.days.map((d) => (
                      <span key={d.date}>
                        {dayLabel(d.date)}{" "}
                        <strong>
                          {temperature(d.maximumTemperatureCelsius)}
                        </strong>
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </SectionPanel>
        </>
      )}
      <Attribution />
    </section>
  );
}
function Detail({ account }: { account: Account }) {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ["weather", "site", id],
    queryFn: () => readWeather(id!),
  });
  const site = query.data;
  return (
    <section className="weather-page">
      <PageHeader
        title={site?.name ?? "Site weather assessment"}
        back={<Link to="/weather-monitoring">← Weather monitoring</Link>}
        description="Three-day forecast assessed against the latest manually recorded supply."
        actions={
          <Button
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh assessment
          </Button>
        }
      />
      <FormError error={query.error} />
      {query.isPending && (
        <StatePanel title="Loading site assessment…" role="status" />
      )}
      {site && (
        <>
          <div className="weather-priority">
            <div>
              <Status site={site} />
              <p>
                Daily maximum &gt; {site.heatThresholdCelsius.toFixed(1)}°C AND
                recorded supply Low.
              </p>
            </div>
            <Link
              className={buttonClassName("secondary")}
              to={`/supply-monitoring/${site.id}`}
            >
              {account.role === "Staff"
                ? "Record supply reading"
                : "View supply history"}
            </Link>
          </div>
          {limited(site) && (
            <Alert>
              <strong>Assessment is provisional or incomplete.</strong>
              <ul>
                {site.limitations.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              {site.forecastRetryAfter && (
                <p>
                  Provider retry available after{" "}
                  {stamp(site.forecastRetryAfter)}. Refreshing during the retry
                  window retains saved values.
                </p>
              )}
            </Alert>
          )}
          <div className="weather-evidence-grid">
            <SectionPanel title="Latest manual reading">
              <strong className="weather-evidence-value">
                {site.latestSupplyStatus ?? "Not recorded"}
              </strong>
              <p className="weather-note">
                Manual supply recorded: {stamp(site.latestSupplyAt)}
              </p>
              {site.supplyStale && (
                <Badge tone="warning">Outdated reading · over 24 hours</Badge>
              )}
            </SectionPanel>
            <SectionPanel title="Weather forecast source">
              <strong className="weather-evidence-value weather-teal">
                {site.days.every((d) => d.maximumTemperatureCelsius === null)
                  ? "—"
                  : temperature(
                      Math.max(
                        ...site.days.flatMap((d) =>
                          d.maximumTemperatureCelsius === null
                            ? []
                            : [d.maximumTemperatureCelsius],
                        ),
                      ),
                    )}
              </strong>
              <p className="weather-note">
                Forecast peak · retrieved {stamp(site.forecastRetrievedAt)}
              </p>
              <Badge>
                {site.forecastMissing
                  ? "Forecast missing"
                  : site.forecastStale
                    ? "Forecast stale"
                    : site.forecastIncomplete
                      ? "Forecast incomplete"
                      : "Forecast available"}
              </Badge>
            </SectionPanel>
            <SectionPanel title="Assessment logic">
              <p>
                Triggered when forecast daily maximum exceeds{" "}
                <strong>{site.heatThresholdCelsius.toFixed(1)}°C AND</strong>{" "}
                latest manual supply is Low.
              </p>
              <p className="weather-note">
                Normal or Unavailable supply do not trigger weather risk alerts.
                The demo threshold is read-only for Staff.
              </p>
            </SectionPanel>
          </div>
          <SectionPanel title="3-day forecast daily maximum temperature">
            <div className="weather-detail-forecast">
              <div>
                <Forecast site={site} />
              </div>
              <Table label="Tabular forecast data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Forecast max</th>
                    <th>Δ threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {site.days.map((day) => (
                    <tr key={day.date}>
                      <td>{dayLabel(day.date)}</td>
                      <td>{temperature(day.maximumTemperatureCelsius)}</td>
                      <td>
                        {day.maximumTemperatureCelsius === null
                          ? "—"
                          : `${day.maximumTemperatureCelsius > site.heatThresholdCelsius ? "+" : ""}${(day.maximumTemperatureCelsius - site.heatThresholdCelsius).toFixed(1)}°C`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </SectionPanel>
          <SectionPanel
            title="3-day assessment outlook timeline"
            className="weather-detail-timeline"
          >
            <Timeline site={site} />
            <p className="weather-note">
              Daily outlooks evaluate the three forecast days against the latest
              recorded manual supply, not predicted future supply.
            </p>
          </SectionPanel>
          <div className="weather-secondary-grid">
            <SectionPanel title="Recommended operational actions">
              {site.recommendedActions.length ? (
                site.recommendedActions.map((action) => (
                  <div className="weather-recommendation" key={action.code}>
                    <h3>{action.instruction}</h3>
                    <p className="muted">{action.reason}</p>
                  </div>
                ))
              ) : (
                <p>No combined warning. Continue routine supply monitoring.</p>
              )}
              <Link
                className={buttonClassName("secondary")}
                to={`/supply-monitoring/${site.id}`}
              >
                {account.role === "Staff"
                  ? "Record supply reading"
                  : "View supply history"}
              </Link>
            </SectionPanel>
            <SectionPanel title="Station site location">
              <WeatherMap sites={[site]} onSelect={() => {}} />
              <Link to="/map">Open operational map →</Link>
            </SectionPanel>
          </div>
        </>
      )}
      <Attribution />
    </section>
  );
}
function Settings({ account }: { account: Account }) {
  const query = useQuery({
    queryKey: ["weather", "settings"],
    queryFn: readSettings,
    enabled: account.role === "Admin",
  });
  const client = useQueryClient();
  const [value, setValue] = useState<string | null>(null);
  const [validation, setValidation] = useState("");
  const mutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: async () => {
      setValue(null);
      await client.invalidateQueries({ queryKey: ["weather"] });
    },
  });
  if (account.role !== "Admin")
    return (
      <StatePanel title="Access denied">
        Only administrators can configure the demo threshold.
        <Link to="/weather-monitoring"> Return to weather monitoring</Link>
      </StatePanel>
    );
  return (
    <section className="weather-page">
      <PageHeader
        title="Demo heat threshold"
        back={<Link to="/weather-monitoring">← Weather monitoring</Link>}
        description="Configure the temperature used for potential supply-risk assessments."
      />
      <div className="weather-settings">
        <SectionPanel title="Organization-wide threshold">
          <FormError error={query.error} />
          {query.data && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const raw = value ?? String(query.data.heatThresholdCelsius);
                const number = Number(raw);
                if (
                  !raw.trim() ||
                  !Number.isFinite(number) ||
                  number < 0 ||
                  number > 60
                ) {
                  setValidation("Enter a temperature from 0 to 60°C.");
                  return;
                }
                setValidation("");
                mutation.mutate(number);
              }}
            >
              <Field
                id="heat-threshold"
                label="Demo heat threshold (°C)"
                hint="Enter a value from 0 to 60. This is not an official danger level."
                error={validation}
              >
                <input
                  id="heat-threshold"
                  type="number"
                  min="0"
                  max="60"
                  step="any"
                  required
                  value={value ?? query.data.heatThresholdCelsius}
                  onChange={(e) => {
                    setValue(e.target.value);
                    mutation.reset();
                  }}
                  aria-invalid={!!validation}
                  aria-describedby={`heat-threshold-hint${validation ? " heat-threshold-error" : ""}`}
                />
              </Field>
              <p className="weather-note">
                Last saved: {stamp(query.data.updatedAt)}
              </p>
              <FormError error={mutation.error} />
              {mutation.isSuccess && (
                <Alert tone="success">
                  Threshold saved. Weather assessments now use the updated
                  setting.
                </Alert>
              )}
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving…" : "Save threshold"}
              </Button>
            </form>
          )}
        </SectionPanel>
        <SectionPanel title="How the rule works">
          <p>
            Forecast maximum temperature must strictly exceed the threshold, and
            the latest recorded manual supply must be Low.
          </p>
          <p>
            At a 35°C threshold, 35°C does not trigger; 35.1°C with Low supply
            does. Unavailable supply remains a separate interruption. Missing
            data means Unknown.
          </p>
        </SectionPanel>
      </div>
      <Attribution />
    </section>
  );
}
export function WeatherMonitoring({ account }: { account: Account }) {
  return (
    <Routes>
      <Route index element={<Overview account={account} />} />
      <Route path="settings" element={<Settings account={account} />} />
      <Route path=":id" element={<Detail account={account} />} />
    </Routes>
  );
}
