import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Start Vite, then set CDP_HELPER and CHROME_PATH to local executable paths.
// The fixture intercepts auth, CSRF, and monitoring API calls; no backend/packages are needed.
const helperPath = process.env.CDP_HELPER;
if (!helperPath) {
  throw new Error("Set CDP_HELPER to the zero-dependency cdp.mjs helper path.");
}
const baseUrl = process.env.WEB_BASE_URL ?? "http://localhost:5173";
const captureDir = process.env.CAPTURE_DIR;
if (captureDir) await mkdir(captureDir, { recursive: true });
const { Browser } = await import(pathToFileURL(helperPath));
const browser = await Browser.launch({
  width: 1440,
  height: 1000,
  extraArgs: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const fixture = String.raw`(() => {
  const params = new URL(location.href).searchParams;
  const role = params.get("qaRole") || "Staff";
  const id = "b561e448-49d0-4f4a-ab82-7d074f8c61e7";
  const id2 = "a461e448-49d0-4f4a-ab82-7d074f8c61e7";
  const account = { id: "person-1", email: "fixture@aqours.test", firstName: "Jamie", middleName: null, lastName: "Santos", role, requiresPasswordChange: false };
  const reading = (status, seq) => ({ id: "reading-" + seq, siteId: id, status, updatedBy: { id: "person-1", name: "Jamie Santos" }, updatedAt: "2026-10-29T03:15:20.123456Z" });
  const site = (siteId, name, latestSupply) => ({ id: siteId, name, address: { regionCode: "0100000000", regionName: "Ilocos Region", provinceCode: "0102800000", provinceName: "Ilocos Norte", cityMunicipalityCode: "0102801000", cityMunicipalityName: "Laoag City", subMunicipalityCode: null, subMunicipalityName: null, barangayCode: "0102801001", barangayName: "San Nicolas", details: "Near the old bridge" }, latitude: 18.2, longitude: 120.6, createdAt: "2026-10-27T08:30:00Z", updatedAt: "2026-10-27T08:30:00Z", latestSupply });
  const sites = [site(id, "North Reservoir", reading("Low", 1)), site(id2, "Riverside Pump", null)];
  const allSites = [...sites, ...Array.from({ length: 18 }, (_, index) => site("c461e448-49d0-4f4a-ab82-7d074f8c6" + String(index + 10).padStart(2, "0"), "Fixture Site " + (index + 3), null)), site("d461e448-49d0-4f4a-ab82-7d074f8c61e7", "South Reservoir", null)];
  const history = [reading("Low", 1)];
  const counts = { list: 0, save: 0 };
  const postChecks = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const originalFetch = window.fetch.bind(window);
  window.__aqoursFixture = { counts, history, postChecks };
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (!url.pathname.startsWith("/api/")) return originalFetch(input, init);
    if (url.pathname === "/api/auth/me") return json(account);
    if (url.pathname === "/api/auth/web/csrf") return json({ requestToken: "fixture-csrf" });
    if (url.pathname === "/api/staff/supply-sites" && (!init.method || init.method === "GET")) {
      counts.list++;
      if (params.get("qaRetry") === "list" && counts.list === 1) return json({ detail: "fixture temporary failure" }, 503);
      const page = Number(url.searchParams.get("page") || 1);
      return json({ items: allSites.slice((page - 1) * 20, page * 20), page, pageSize: 20, totalCount: allSites.length });
    }
    if (url.pathname === "/api/staff/supply-sites/" + id && (!init.method || init.method === "GET")) return json({ ...sites[0], latestSupply: history[0] });
    if (url.pathname === "/api/staff/supply-sites/" + id2 && (!init.method || init.method === "GET")) return json(sites[1]);
    if (url.pathname.endsWith("/supply-updates") && (!init.method || init.method === "GET")) {
      const page = Number(url.searchParams.get("page") || 1);
      const readings = url.pathname.includes(id2) ? [] : history;
      return json({ items: page === 1 ? [...readings] : [], page, pageSize: 20, totalCount: readings.length });
    }
    if (url.pathname.endsWith("/supply-updates") && init.method === "POST") {
      counts.save++;
      postChecks.push({ body: init.body, csrf: new Headers(init.headers).get("X-CSRF-TOKEN"), credentials: init.credentials });
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (params.has("qaRetrySave") && counts.save === 1) return json({ detail: "fixture temporary failure" }, 503);
      const created = reading(JSON.parse(init.body).status, history.length + 1);
      history.unshift(created);
      sites[0].latestSupply = created;
      return json(created, 201);
    }
    return json({ detail: "Unexpected fixture API route: " + url.pathname }, 500);
  };
})();`;

async function open(role, flags = "") {
  const page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: fixture });
  const suffix = `?qaRole=${role}${flags}`;
  await page.goto(`${baseUrl}/supply-monitoring${suffix}`, { settleMs: 800 });
  return page;
}

async function waitFor(page, expression, description) {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    if (await page.eval(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Timed out waiting for ${description}; page text: ${(await page.eval("document.body.innerText")).slice(0, 500)}`,
  );
}

async function click(page, selector) {
  const clicked = await page.eval((sel) => {
    const element = document.querySelector(sel);
    if (!(element instanceof HTMLElement)) return false;
    element.focus();
    element.click();
    return true;
  }, selector);
  assert.equal(clicked, true, `Expected clickable element: ${selector}`);
}

try {
  console.log("Browser fixture: Staff directory and retry");
  const staff = await open("Staff", "&qaRetry=list&qaRetrySave=1");
  await waitFor(
    staff,
    `document.body.innerText.includes("Could not load supply readings")`,
    "initial list failure",
  );
  await click(staff, '[role="alert"] button');
  await waitFor(
    staff,
    `document.body.innerText.includes("North Reservoir")`,
    "retry to load the directory",
  );
  if (captureDir)
    await staff.screenshot({
      path: join(captureDir, "staff-directory.png"),
      format: "png",
      fullPage: true,
    });
  assert.match(
    await staff.eval("document.body.innerText"),
    /manually, not live sensor data/i,
  );
  assert.match(await staff.eval("document.body.innerText"), /Low/);

  await click(staff, 'button[aria-label="Next page"]');
  await waitFor(
    staff,
    `location.search.includes("page=2")`,
    "pagination to page two",
  );
  await waitFor(
    staff,
    `document.body.innerText.includes("South Reservoir")`,
    "second-page supply site",
  );
  await click(staff, 'button[aria-label="Previous page"]');
  await waitFor(
    staff,
    `document.body.innerText.includes("North Reservoir")`,
    "return to first page",
  );

  await click(staff, 'button[aria-label="Record reading for North Reservoir"]');
  await waitFor(
    staff,
    `!!document.querySelector("dialog[open]")`,
    "record dialog",
  );
  if (captureDir)
    await staff.screenshot({
      path: join(captureDir, "staff-record-dialog.png"),
      format: "png",
    });
  await staff.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await staff.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await waitFor(
    staff,
    `!document.querySelector("dialog[open]")`,
    "Escape to close the record dialog",
  );
  assert.equal(
    await staff.eval("document.activeElement.getAttribute('aria-label')"),
    "Record reading for North Reservoir",
    "closing dialog restores focus",
  );
  await click(staff, 'button[aria-label="Record reading for North Reservoir"]');
  await click(staff, 'dialog button[type="submit"]');
  await waitFor(
    staff,
    `document.body.innerText.includes("Select a supply status before saving.")`,
    "required status validation",
  );
  await click(staff, 'input[value="Low"]');
  await click(staff, 'dialog button[type="submit"]');
  await new Promise((resolve) => setTimeout(resolve, 50));
  await click(staff, 'dialog button[type="submit"]');
  assert.equal(
    await staff.eval("window.__aqoursFixture.counts.save"),
    1,
    "pending save does not submit twice",
  );
  await waitFor(
    staff,
    `document.body.innerText.includes("We couldn't save this reading")`,
    "save failure feedback",
  );
  assert.equal(
    await staff.eval(`document.querySelector('input[value="Low"]').checked`),
    true,
    "failed save should preserve selection",
  );
  await click(staff, 'dialog button[type="submit"]');
  await waitFor(
    staff,
    `!document.querySelector("dialog[open]") && document.body.innerText.includes("Supply reading recorded")`,
    "successful retry",
  );
  assert.equal(
    await staff.eval(`window.__aqoursFixture.history.length`),
    2,
    "saving the same status creates a new history item",
  );
  assert.equal(
    await staff.eval(`window.__aqoursFixture.counts.save`),
    2,
    "retry submits once per explicit save",
  );
  assert.deepEqual(
    await staff.eval("window.__aqoursFixture.postChecks"),
    [
      {
        body: JSON.stringify({ status: "Low" }),
        csrf: "fixture-csrf",
        credentials: "same-origin",
      },
      {
        body: JSON.stringify({ status: "Low" }),
        csrf: "fixture-csrf",
        credentials: "same-origin",
      },
    ],
    "POST carries the selected status, CSRF token, and same-origin credentials",
  );

  await click(staff, 'a[aria-label="View history for North Reservoir"]');
  await waitFor(
    staff,
    `document.body.innerText.includes("Reading history") && document.body.innerText.includes("2 readings")`,
    "updated reading history",
  );
  assert.match(await staff.eval("document.body.innerText"), /Jamie Santos/);
  await click(staff, "a.back-link");
  await waitFor(
    staff,
    `document.body.innerText.includes("Riverside Pump")`,
    "return from history to directory",
  );
  await click(staff, 'a[aria-label="View history for Riverside Pump"]');
  await waitFor(
    staff,
    `document.body.innerText.includes("No supply readings yet.")`,
    "first-reading empty history",
  );
  assert.equal(
    await staff.eval(
      `document.querySelectorAll('button').length > 0 && [...document.querySelectorAll('button')].some(button => button.innerText.includes("Record first reading"))`,
    ),
    true,
    "Staff can start the first reading from an empty history",
  );

  const admin = await open("Admin");
  console.log("Browser fixture: Admin role and responsive layout");
  await waitFor(
    admin,
    `document.body.innerText.includes("North Reservoir")`,
    "admin monitoring directory",
  );
  assert.equal(
    await admin.eval(
      `document.querySelectorAll('button[aria-label^="Record reading for"]').length`,
    ),
    0,
    "Admin must not see record controls",
  );
  assert.match(
    await admin.eval("document.body.innerText"),
    /Only Staff can record supply readings/,
  );
  await click(admin, 'a[aria-label="View history for Riverside Pump"]');
  await waitFor(
    admin,
    `document.body.innerText.includes("No supply readings yet.")`,
    "empty site history",
  );
  assert.equal(
    await admin.eval(
      `document.querySelectorAll('button[aria-label*="Record"]').length`,
    ),
    0,
    "Admin history remains read-only",
  );

  await admin.setViewport({ width: 390, height: 844, mobile: true });
  await admin.send("Runtime.evaluate", {
    expression: "window.dispatchEvent(new Event('resize'))",
  });
  if (captureDir)
    await admin.screenshot({
      path: join(captureDir, "admin-mobile.png"),
      format: "png",
      fullPage: true,
    });
  const dimensions = await admin.eval(
    `({ viewport: document.documentElement.clientWidth, body: document.body.scrollWidth, content: document.querySelector("main")?.scrollWidth || 0, table: document.querySelector(".ui-table-scroll")?.scrollWidth || 0 })`,
  );
  assert.ok(
    dimensions.body <= dimensions.viewport + 1,
    `narrow layout has horizontal page overflow: ${JSON.stringify(dimensions)}`,
  );
  assert.ok(
    dimensions.table > 0,
    "monitoring table wrapper should remain available at narrow widths",
  );
  if (captureDir) {
    const medium = await open("Staff");
    await medium.setViewport({ width: 768, height: 1024, mobile: true });
    await medium.send("Runtime.evaluate", {
      expression: "window.dispatchEvent(new Event('resize'))",
    });
    await waitFor(
      medium,
      `document.body.innerText.includes("North Reservoir")`,
      "tablet directory",
    );
    await medium.screenshot({
      path: join(captureDir, "staff-tablet.png"),
      format: "png",
      fullPage: true,
    });
    await medium.send("Page.close");
  }

  for (const page of [staff, admin])
    assert.deepEqual(
      page.consoleErrors,
      [],
      "browser should have no uncaught runtime errors",
    );
  console.log(
    "Supply monitoring browser fixture passed (Staff retry/validation/save/history, Admin read-only, pagination, narrow layout).",
  );
} finally {
  await browser.close();
}
