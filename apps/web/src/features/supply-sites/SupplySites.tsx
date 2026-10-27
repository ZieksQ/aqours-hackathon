import {
  Alert,
  Button,
  PageHeader,
  Pagination,
  SectionPanel,
  StatePanel,
  Table,
  buttonClassName,
} from "@aqours/ui";
import { useQuery } from "@tanstack/react-query";
import {
  FiArrowLeft,
  FiEdit2,
  FiInfo,
  FiMap,
  FiMapPin,
  FiPlus,
} from "react-icons/fi";
import {
  Link,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router";
import { listSites, readSite, siteAddress, siteError, siteTime } from "./api";
import { SiteForm } from "./SiteForm";
import { SiteMap } from "./SiteMap";
import "./supply-sites.css";

export function SupplySites() {
  return (
    <Routes>
      <Route index element={<SiteDirectory />} />
      <Route path="new" element={<SiteForm />} />
      <Route path=":id" element={<SiteDetails />} />
      <Route path=":id/edit" element={<EditSite />} />
      <Route
        path="*"
        element={
          <StatePanel
            title="Page unavailable"
            action={<Link to="/supply-sites">Back to supply sites</Link>}
          />
        }
      />
    </Routes>
  );
}
function AddSiteLink() {
  return (
    <Link to="/supply-sites/new" className={buttonClassName()}>
      <FiPlus aria-hidden="true" />
      Add supply site
    </Link>
  );
}
function SiteDirectory() {
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const size = Number(params.get("pageSize") ?? 20);
  const pageSize = [20, 50, 100].includes(size) ? size : 20;
  const sites = useQuery({
    queryKey: ["supply-sites", page, pageSize],
    queryFn: () => listSites(page, pageSize),
  });
  return (
    <section className="supply-sites site-directory">
      <PageHeader
        title="Supply sites"
        description="Manage supplier site records and their Philippine addresses."
        actions={<AddSiteLink />}
      />
      <div className="site-directory-panel">
        <div className="site-directory-heading">
          <h2>Site directory</h2>
          <span className="muted">
            {sites.data
              ? `${sites.data.totalCount} supply sites`
              : "Loading records…"}
          </span>
        </div>
        <Table label="Supply site directory" className="site-table">
          <thead>
            <tr>
              <th>Site name</th>
              <th>Address</th>
              <th>Last updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sites.data?.items.map((site) => (
              <tr key={site.id}>
                <td>
                  <Link to={`/supply-sites/${site.id}`} className="site-name">
                    {site.name}
                  </Link>
                </td>
                <td>
                  <span className="site-row-address">
                    {siteAddress(site.address)}
                  </span>
                </td>
                <td>
                  <time dateTime={site.updatedAt}>
                    {siteTime(site.updatedAt)}
                  </time>
                </td>
                <td>
                  <Link
                    className="site-view"
                    aria-label={`View details for ${site.name}`}
                    to={`/supply-sites/${site.id}`}
                  >
                    View details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {sites.isPending ? (
          <StatePanel title="Loading supply sites…" role="status" />
        ) : sites.isError ? (
          <StatePanel
            title="Could not load supply sites"
            role="alert"
            action={<Button onClick={() => void sites.refetch()}>Retry</Button>}
          >
            {siteError(sites.error)}
          </StatePanel>
        ) : (
          sites.data.items.length === 0 && (
            <StatePanel
              title={
                sites.data.totalCount === 0
                  ? "No supply sites yet"
                  : "No sites on this page"
              }
              action={
                sites.data.totalCount === 0 ? (
                  <AddSiteLink />
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setParams({ page: "1", pageSize: String(pageSize) })
                    }
                  >
                    Return to first page
                  </Button>
                )
              }
            >
              {sites.data.totalCount === 0
                ? "Add your first supply site to start building your directory."
                : "Choose another page to view recorded sites."}
            </StatePanel>
          )
        )}
        {sites.data && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={sites.data.totalCount}
            count={sites.data.items.length}
            noun="supply sites"
            compact
            onChange={(next) =>
              setParams({ page: String(next), pageSize: String(pageSize) })
            }
            onPageSizeChange={(next) =>
              setParams({ page: "1", pageSize: String(next) })
            }
            disabled={sites.isFetching}
          />
        )}
      </div>
      <p className="site-directory-note">
        <FiInfo aria-hidden="true" />
        Times shown in Asia/Manila (PHT). Sites are listed by name.
      </p>
    </section>
  );
}
function useSite() {
  const { id = "" } = useParams();
  return useQuery({
    queryKey: ["supply-site", id],
    queryFn: () => readSite(id),
    retry: false,
  });
}
function SiteLoadState({ query }: { query: ReturnType<typeof useSite> }) {
  return (
    <>
      <PageHeader
        title="Supply site"
        back={
          <Link className="back-link" to="/supply-sites">
            <FiArrowLeft aria-hidden="true" />
            Back to supply sites
          </Link>
        }
      />
      <StatePanel
        title={
          query.isPending ? "Loading supply site…" : "Supply site unavailable"
        }
        role={query.isPending ? "status" : "alert"}
        action={
          query.isError && (
            <Button onClick={() => void query.refetch()}>Retry</Button>
          )
        }
      >
        {query.error && siteError(query.error)}
      </StatePanel>
    </>
  );
}
function EditSite() {
  const site = useSite();
  return site.data ? (
    <SiteForm key={site.data.id} site={site.data} />
  ) : (
    <SiteLoadState query={site} />
  );
}
function SiteDetails() {
  const query = useSite();
  const location = useLocation();
  if (!query.data) return <SiteLoadState query={query} />;
  const site = query.data;
  const rows = [
    ["Region", site.address.regionName],
    ["Province", site.address.provinceName],
    ["City / municipality", site.address.cityMunicipalityName],
    ["Sub-municipality", site.address.subMunicipalityName],
    ["Barangay", site.address.barangayName],
    ["Street or landmark", site.address.details],
  ];
  return (
    <section className="supply-sites site-details">
      <PageHeader
        title={site.name}
        description="Supplier site record and Philippine administrative address."
        actions={
          <>
            <Link to="/supply-sites" className={buttonClassName("secondary")}>
              <FiArrowLeft aria-hidden="true" />
              Back to supply sites
            </Link>
            <Link
              to={`/supply-sites/${site.id}/edit`}
              className={buttonClassName()}
            >
              <FiEdit2 aria-hidden="true" />
              Edit site
            </Link>
          </>
        }
      />
      {location.state?.notice && (
        <Alert tone="success">{location.state.notice}</Alert>
      )}
      <SectionPanel title="Site details" icon={<FiInfo aria-hidden="true" />}>
        <dl className="site-metadata">
          {[
            ["Site name", site.name],
            ["Site ID", site.id],
            ["Created", siteTime(site.createdAt)],
            ["Last updated", siteTime(site.updatedAt)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="site-helper">Times shown in Asia/Manila (PHT)</p>
      </SectionPanel>
      <div className="site-details-grid">
        <SectionPanel title="Address" icon={<FiMapPin aria-hidden="true" />}>
          <div className="site-address-summary">
            <p className="site-helper">Canonical address</p>
            <p>{siteAddress(site.address)}</p>
          </div>
          <Table
            label="Philippine administrative address"
            className="site-address-table"
          >
            <thead>
              <tr>
                <th>Level</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>
                    {value ?? (
                      <span className="muted">
                        Not applicable for this location
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </SectionPanel>
        <SectionPanel title="Site location" icon={<FiMap aria-hidden="true" />}>
          <SiteMap value={site} />
          <p className="site-address-summary">
            {site.address.details} · {site.address.cityMunicipalityName}
            {site.address.provinceName && `, ${site.address.provinceName}`}
          </p>
          <Alert>
            Site location marked on map. Addresses and map locations are stored
            independently.
          </Alert>
        </SectionPanel>
      </div>
    </section>
  );
}
