import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Field,
  PageHeader,
  SectionPanel,
} from "@aqours/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiMapPin, FiPlus, FiSave } from "react-icons/fi";
import { Link, useNavigate } from "react-router";
import { ApiError } from "../accounts/api";
import { saveSite, siteError, type SiteInput, type SupplySite } from "./api";
import {
  addressCodes,
  choiceField,
  loadRegion,
  regions,
  resolvePath,
  type LocationNode,
} from "./locations";
import { SiteMap, type MapPoint } from "./SiteMap";

type Errors = Record<string, string>;
const fieldNames: Record<string, string> = {
  name: "Site name",
  "address.regionCode": "Region",
  "address.provinceCode": "Province / independent city",
  "address.cityMunicipalityCode": "City / municipality",
  "address.subMunicipalityCode": "Sub-municipality",
  "address.barangayCode": "Barangay",
  "address.details": "Street or landmark details",
  location: "Site location",
};
const fieldId = (key: string) =>
  key === "location" ? "site-location" : `site-${key.replace("address.", "")}`;
export function SiteForm({ site }: { site?: SupplySite }) {
  const initialCodes = site
    ? [
        site.address.regionCode,
        site.address.provinceCode,
        site.address.cityMunicipalityCode,
        site.address.subMunicipalityCode,
        site.address.barangayCode,
      ].filter((code): code is string => !!code)
    : [];
  const [name, setName] = useState(site?.name ?? "");
  const [details, setDetails] = useState(site?.address.details ?? "");
  const [codes, setCodes] = useState<string[]>(initialCodes);
  const [point, setPoint] = useState<MapPoint | null>(
    site ? { latitude: site.latitude, longitude: site.longitude } : null,
  );
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const region = useQuery({
    queryKey: ["psgc-region", codes[0]],
    queryFn: () => loadRegion(codes[0]),
    enabled: !!codes[0],
    staleTime: Infinity,
  });
  const path = resolvePath(region.data, codes);
  const dirty =
    name !== (site?.name ?? "") ||
    details !== (site?.address.details ?? "") ||
    codes.join() !== initialCodes.join() ||
    JSON.stringify(point) !==
      JSON.stringify(
        site ? { latitude: site.latitude, longitude: site.longitude } : null,
      );
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const leave = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        !link ||
        link.origin !== window.location.origin ||
        link.pathname === window.location.pathname ||
        submitting.current
      )
        return;
      if (!window.confirm("Discard your unsaved supply site changes?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", leave, true);
    };
  }, [dirty]);
  useEffect(() => {
    if (Object.keys(errors).length || failure) summary.current?.focus();
  }, [errors, failure]);
  const save = useMutation({
    mutationFn: (input: SiteInput) => saveSite(input, site?.id),
    onSuccess: (saved) => {
      queryClient.setQueryData(["supply-site", saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ["supply-sites"] });
      navigate(`/supply-sites/${saved.id}`, {
        replace: true,
        state: { notice: site ? "Supply site updated" : "Supply site created" },
      });
    },
    onError: (error) => {
      const next: Errors = {};
      if (error instanceof ApiError)
        for (const [key, messages] of Object.entries(error.errors)) {
          if (["latitude", "longitude"].includes(key))
            next.location = "Choose a valid site location on the map.";
          else if (fieldNames[key]) next[key] = messages.join(" ");
          else if (key.startsWith("address"))
            next["address.barangayCode"] =
              "Choose a complete, valid Philippine address.";
        }
      setErrors(next);
      setFailure(Object.keys(next).length ? null : siteError(error));
    },
    onSettled: () => {
      submitting.current = false;
    },
  });
  const changeCodes = (next: string[]) => {
    setCodes(next);
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) => !key.startsWith("address.") || key === "address.details",
        ),
      ),
    );
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const next: Errors = {};
    const address = addressCodes(path);
    if (!name.trim() || name.trim().length > 200)
      next.name = "Enter a site name (up to 200 characters).";
    if (!details.trim() || details.trim().length > 500)
      next["address.details"] =
        "Enter street or landmark details (up to 500 characters).";
    if (!address.regionCode) next["address.regionCode"] = "Choose a region.";
    else if (!address.barangayCode) {
      const children = path.at(-1)?.children ?? [];
      const key = children.length ? choiceField(children).key : "barangayCode";
      next[`address.${key}`] =
        "Complete the address selection through barangay.";
    }
    if (
      !point ||
      !Number.isFinite(point.latitude) ||
      Math.abs(point.latitude) > 90 ||
      !Number.isFinite(point.longitude) ||
      Math.abs(point.longitude) > 180
    )
      next.location = "Choose a valid site location on the map.";
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length || !point) return;
    submitting.current = true;
    save.mutate({
      name: name.trim(),
      address: { ...address, details: details.trim() },
      ...point,
    });
  }
  const inputProps = (key: string) => ({
    id: fieldId(key),
    "aria-invalid": !!errors[key],
    "aria-describedby":
      [
        errors[key] && `${fieldId(key)}-error`,
        ["name", "address.details"].includes(key) && `${fieldId(key)}-hint`,
      ]
        .filter(Boolean)
        .join(" ") || undefined,
  });
  const selectors = path.flatMap((parent, index) => {
    if (!parent.children.length) return [];
    const field = choiceField(parent.children);
    return [
      {
        ...field,
        nodes: parent.children,
        selected: codes[index + 1] ?? "",
        depth: index + 1,
      },
    ];
  });
  const selectedCity = path.find((node) =>
    ["city", "municipality"].includes(node.geographic_level),
  );
  const selectedSub = path.find(
    (node) => node.geographic_level === "sub_municipality",
  );
  const renderChoice = (key: string, label: string) => {
    const choice = selectors.find((item) => item.key === key);
    const selected =
      key === "cityMunicipalityCode"
        ? selectedCity
        : key === "subMunicipalityCode"
          ? selectedSub
          : undefined;
    const notApplicable =
      (key === "provinceCode" &&
        !!region.data &&
        !region.data.children.some(
          (node) => node.geographic_level === "province",
        )) ||
      (key === "subMunicipalityCode" &&
        !!selectedCity &&
        !selectedCity.children.some(
          (node) => node.geographic_level === "sub_municipality",
        ));
    const errorKey = `address.${key}`;
    return (
      <Field
        key={key}
        id={fieldId(errorKey)}
        label={choice?.label ?? label}
        required={!notApplicable && !!choice}
        error={errors[errorKey]}
      >
        <select
          {...inputProps(errorKey)}
          required={!!choice}
          disabled={!choice || save.isPending || region.isFetching}
          value={choice?.selected ?? selected?.psgc_code ?? ""}
          onChange={(event) => {
            if (choice)
              changeCodes([
                ...codes.slice(0, choice.depth),
                ...(event.target.value ? [event.target.value] : []),
              ]);
          }}
        >
          {choice ? (
            <>
              <option value="">Select {choice.label.toLowerCase()}</option>
              {choice.nodes.map((node: LocationNode) => (
                <option key={node.psgc_code} value={node.psgc_code}>
                  {node.name}
                </option>
              ))}
            </>
          ) : (
            <option value={selected?.psgc_code ?? ""}>
              {selected?.name ??
                (notApplicable
                  ? "Not applicable for this location"
                  : "Select the address above first")}
            </option>
          )}
        </select>
      </Field>
    );
  };
  return (
    <section className="supply-sites site-form-page">
      <PageHeader
        title={site ? "Edit supply site" : "Add supply site"}
        description={
          site
            ? "Update the recorded site details, address, and map location."
            : "Record a supplier facility and its location."
        }
        actions={dirty ? <Badge>Unsaved changes</Badge> : undefined}
      />
      <form
        className="site-form"
        noValidate
        onSubmit={submit}
        aria-busy={save.isPending}
      >
        {(Object.keys(errors).length > 0 || failure) && (
          <div ref={summary} className="site-error-summary" tabIndex={-1}>
            <Alert tone="error">
              {failure ?? (
                <>
                  <strong>
                    Check {Object.keys(errors).length}{" "}
                    {Object.keys(errors).length === 1 ? "field" : "fields"}{" "}
                    before saving:
                  </strong>
                  <ul>
                    {Object.entries(errors).map(([key, message]) => (
                      <li key={key}>
                        <a
                          href={`#${fieldId(key)}`}
                          onClick={(event) => {
                            event.preventDefault();
                            document.getElementById(fieldId(key))?.focus();
                          }}
                        >
                          {fieldNames[key]}: {message}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {failure && (
                <p>
                  {save.error instanceof ApiError &&
                  save.error.status === 404 ? (
                    <Link to="/supply-sites">Back to supply sites</Link>
                  ) : (
                    "Your changes are retained. Try saving again."
                  )}
                </p>
              )}
            </Alert>
          </div>
        )}
        <fieldset disabled={save.isPending} inert={save.isPending}>
          <SectionPanel title="Site details" note="* Required field">
            <Field
              id="site-name"
              label="Site name"
              required
              error={errors.name}
              hint="Up to 200 characters. Duplicate names are allowed."
            >
              <input
                {...inputProps("name")}
                required
                maxLength={200}
                placeholder="e.g. North Reservoir"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          </SectionPanel>
          <SectionPanel title="Philippine address" note="Select in order">
            <div className="site-address-fields">
              <Field
                id="site-regionCode"
                label="Region"
                required
                error={errors["address.regionCode"]}
              >
                <select
                  {...inputProps("address.regionCode")}
                  required
                  value={codes[0] ?? ""}
                  onChange={(event) =>
                    changeCodes(event.target.value ? [event.target.value] : [])
                  }
                >
                  <option value="">Select region</option>
                  {regions.map((item) => (
                    <option key={item.psgc_code} value={item.psgc_code}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              {renderChoice("provinceCode", "Province")}
              {renderChoice("cityMunicipalityCode", "City / municipality")}
              {renderChoice("subMunicipalityCode", "Sub-municipality")}
              {renderChoice("barangayCode", "Barangay")}
            </div>
            {region.isFetching && (
              <p className="site-helper" role="status">
                Loading address choices…
              </p>
            )}
            {region.isError && (
              <Alert tone="error">
                Could not load address choices.{" "}
                <Button
                  variant="secondary"
                  onClick={() => void region.refetch()}
                >
                  Retry address choices
                </Button>
              </Alert>
            )}
            <Field
              id="site-details"
              label="Street or landmark details"
              required
              error={errors["address.details"]}
              hint="Required, up to 500 characters."
            >
              <textarea
                {...inputProps("address.details")}
                required
                maxLength={500}
                rows={1}
                placeholder="Enter street or landmark details…"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
              />
            </Field>
          </SectionPanel>
          <SectionPanel
            title="Site location"
            icon={<FiMapPin aria-hidden="true" />}
            note="* Required"
          >
            <SiteMap
              value={point}
              onChange={setPoint}
              error={errors.location}
            />
          </SectionPanel>
        </fieldset>
        <div className="site-form-actions">
          <Button
            variant="secondary"
            disabled={save.isPending}
            onClick={() => {
              if (
                !dirty ||
                window.confirm("Discard your unsaved supply site changes?")
              )
                navigate(site ? `/supply-sites/${site.id}` : "/supply-sites");
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || region.isFetching}>
            {site ? (
              <FiSave aria-hidden="true" />
            ) : (
              <FiPlus aria-hidden="true" />
            )}
            {save.isPending
              ? "Saving…"
              : site
                ? "Save changes"
                : "Create supply site"}
          </Button>
        </div>
      </form>
    </section>
  );
}
