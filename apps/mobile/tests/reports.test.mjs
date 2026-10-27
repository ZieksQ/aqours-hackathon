import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { ApiClient, ApiError } from "../src/shared/api.ts";
import { reportingApi } from "../src/features/reports/api.ts";
import {
  emptyDraft,
  validCoordinates,
  validateReport,
} from "../src/features/reports/form.ts";
import {
  addressCodes,
  locationLabel,
  resolveLocationPath,
} from "../src/features/reports/location-tree.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const session = {
  account: { id: "customer", role: "Customer", requiresPasswordChange: false },
  accessToken: "customer-token",
  accessTokenExpiresAt: new Date(Date.now() + 60000).toISOString(),
  refreshToken: "refresh-token",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });
const readData = (file) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../packages/psgc/data/${file}`, import.meta.url),
      "utf8",
    ),
  );
const regions = readData("list-of-all-regions.json");
const ncr = readData(
  regions.find((region) => region.psgc_code === "1300000000").file,
).region;

function pathsToBarangays(node, parents = []) {
  const path = [...parents, node];
  return node.geographic_level === "barangay"
    ? [path]
    : node.children.flatMap((child) => pathsToBarangays(child, path));
}
const commonwealth = pathsToBarangays(ncr).find(
  (path) => path.at(-1).name === "Commonwealth",
);
const payload = {
  issueType: "LowPressure",
  description: "Pressure has been low since morning.",
  address: { ...addressCodes(commonwealth), details: "12 Sampaguita Street" },
  latitude: 14.6978,
  longitude: 121.0873,
};

test("a new draft requires an issue, description, complete address and an explicit location", () => {
  assert.deepEqual(Object.keys(validateReport(emptyDraft(), false)), [
    "issueType",
    "description",
    "address",
    "details",
    "coordinates",
  ]);
  const draft = {
    ...emptyDraft(),
    issueType: "LowPressure",
    description: "  Water pressure is low.  ",
    details: "  Near the school  ",
    coordinates: { latitude: 0, longitude: 0 },
  };
  assert.deepEqual(validateReport(draft, true), {});
  assert.ok(
    validateReport({ ...draft, description: " ", details: " " }, true)
      .description,
  );
  assert.ok(
    validateReport(
      { ...draft, description: "a".repeat(2001), details: "a".repeat(501) },
      true,
    ).details,
  );
  assert.ok(validateReport(draft, false).address);
});

test("coordinate validation accepts boundaries and rejects non-finite and out-of-range values", () => {
  for (const latitude of [-90, 0, 90])
    for (const longitude of [-180, 0, 180])
      assert.equal(validCoordinates({ latitude, longitude }), true);
  for (const point of [
    null,
    { latitude: NaN, longitude: 1 },
    { latitude: 1, longitude: Infinity },
    { latitude: 90.1, longitude: 0 },
    { latitude: 0, longitude: -180.1 },
  ])
    assert.equal(validCoordinates(point), false);
});

test("all canonical barangay paths preserve codes and every actual ancestor level", () => {
  let checked = 0;
  for (const entry of regions) {
    const region = readData(entry.file).region;
    assert.equal(region.psgc_code, entry.psgc_code);
    for (const path of pathsToBarangays(region)) {
      const selected = resolveLocationPath(
        region,
        path.map((node) => node.psgc_code),
      );
      assert.deepEqual(selected, path);
      const codes = addressCodes(selected);
      const find = (...levels) =>
        path.find((node) => levels.includes(node.geographic_level))
          ?.psgc_code ?? null;
      assert.deepEqual(codes, {
        regionCode: entry.psgc_code,
        provinceCode: find("province"),
        cityMunicipalityCode: find("city", "municipality"),
        subMunicipalityCode: find("sub_municipality"),
        barangayCode: find("barangay"),
      });
      for (const code of Object.values(codes))
        if (code !== null) assert.match(code, /^\d{10}$/);
      checked++;
    }
  }
  assert.ok(checked > 40000, `Expected the full dataset, checked ${checked}`);
});

test("NCR omits province, Manila retains its district, and changing a parent drops invalid descendants", () => {
  assert.equal(addressCodes(commonwealth).provinceCode, null);
  assert.equal(locationLabel(ncr.children), "City / Municipality");
  const manilaPath = pathsToBarangays(ncr).find((path) =>
    path.some((node) => node.geographic_level === "sub_municipality"),
  );
  assert.ok(addressCodes(manilaPath).subMunicipalityCode);
  const otherCity = ncr.children.find(
    (city) => city.psgc_code !== commonwealth[1].psgc_code,
  );
  const invalid = resolveLocationPath(ncr, [
    ncr.psgc_code,
    otherCity.psgc_code,
    commonwealth.at(-1).psgc_code,
  ]);
  assert.equal(addressCodes(invalid).barangayCode, "");
  assert.deepEqual(resolveLocationPath(ncr, ["invalid-region"]), []);
});

async function signedIn(handler) {
  globalThis.fetch = async (url, options) =>
    url.endsWith("/login") ? json(session) : handler(url, options);
  const api = new ApiClient("http://supplier.test");
  await api.login("customer@example.test", "password");
  return api;
}

test("submission sends the canonical request with customer Bearer auth and accepts the created receipt", async () => {
  const receipt = {
    ...payload,
    id: "report-1",
    status: "Submitted",
    createdAt: "2026-10-27T00:00:00Z",
  };
  const api = await signedIn((url, options) => {
    assert.equal(url, "http://supplier.test/api/reports");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer customer-token");
    assert.equal(options.credentials, "omit");
    assert.deepEqual(JSON.parse(options.body), payload);
    assert.equal(JSON.parse(options.body).customerId, undefined);
    return json(receipt, 201);
  });
  assert.deepEqual(await reportingApi.submit(api, payload), receipt);
});

test("history, detail and older messages use the existing owner-scoped endpoint contracts", async () => {
  const urls = [];
  const api = await signedIn((url, options) => {
    urls.push(url);
    assert.equal(options.headers.Authorization, "Bearer customer-token");
    assert.equal(options.method, "GET");
    return json({ items: [], nextBefore: null });
  });
  await reportingApi.list(api, 2);
  await reportingApi.detail(api, "owned-report");
  await reportingApi.messages(api, "owned-report", null);
  await reportingApi.messages(api, "owned-report", 42);
  assert.deepEqual(
    urls.map((url) => url.replace("http://supplier.test/api", "")),
    [
      "/reports?page=2&pageSize=20",
      "/reports/owned-report",
      "/reports/owned-report/messages?pageSize=50",
      "/reports/owned-report/messages?pageSize=50&before=42",
    ],
  );
});

test("nested validation errors remain available for the form, and report ownership failures surface as 404", async () => {
  const errors = { "address.barangayCode": ["Choose a valid barangay."] };
  const api = await signedIn(() => json({ errors }, 400));
  await assert.rejects(
    reportingApi.submit(api, payload),
    (error) =>
      error instanceof ApiError &&
      error.status === 400 &&
      error.errors["address.barangayCode"][0] ===
        errors["address.barangayCode"][0],
  );
  globalThis.fetch = async () => new Response(null, { status: 404 });
  await assert.rejects(
    reportingApi.detail(api, "another-customers-report"),
    (error) => error.status === 404,
  );
});

test("customer replies trim their body and a status conflict is not retried automatically", async () => {
  let sends = 0;
  const api = await signedIn((url, options) => {
    sends++;
    assert.equal(url, "http://supplier.test/api/reports/owned-report/messages");
    assert.deepEqual(JSON.parse(options.body), {
      body: "Thank you for the update.",
    });
    return json(
      { detail: "Messages can only be sent while a report is in progress." },
      409,
    );
  });
  await assert.rejects(
    reportingApi.reply(api, "owned-report", "  Thank you for the update.  "),
    (error) => error.status === 409,
  );
  assert.equal(sends, 1);
});
