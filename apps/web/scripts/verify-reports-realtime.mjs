import assert from "node:assert/strict";
import { readFile, unlink } from "node:fs/promises";
import {
  HubConnectionBuilder,
  HttpTransportType,
  LogLevel,
} from "@microsoft/signalr";

const inputPath = process.argv[2];
const input = JSON.parse(await readFile(inputPath, "utf8"));
await unlink(inputPath);

async function webSession(email, password) {
  let cookies = new Map();
  const remember = (response) => {
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(";");
      const separator = pair.indexOf("=");
      if (separator > 0)
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  };
  const cookieHeader = () =>
    [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  const csrfResponse = await fetch(`${input.baseUrl}/api/auth/web/csrf`);
  remember(csrfResponse);
  const csrf = (await csrfResponse.json()).requestToken;
  const login = await fetch(`${input.baseUrl}/api/auth/web/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": csrf,
      Cookie: cookieHeader(),
    },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200, "web login should succeed");
  remember(login);
  const refreshedCsrfResponse = await fetch(
    `${input.baseUrl}/api/auth/web/csrf`,
    { headers: { Cookie: cookieHeader() } },
  );
  remember(refreshedCsrfResponse);
  const refreshedCsrf = (await refreshedCsrfResponse.json()).requestToken;
  const changed = await fetch(`${input.baseUrl}/api/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": refreshedCsrf,
      Cookie: cookieHeader(),
    },
    body: JSON.stringify({
      currentPassword: password,
      newPassword: input.changedPassword,
    }),
  });
  assert.equal(
    changed.status,
    200,
    "initial web password change should succeed",
  );
  remember(changed);
  const finalCsrfResponse = await fetch(`${input.baseUrl}/api/auth/web/csrf`, {
    headers: { Cookie: cookieHeader() },
  });
  remember(finalCsrfResponse);
  const finalCsrf = (await finalCsrfResponse.json()).requestToken;
  return { cookie: cookieHeader(), csrf: finalCsrf };
}

const hubUrl = `${input.baseUrl}/api/hubs/reports`;

async function customerSession(email, password) {
  const login = await fetch(`${input.baseUrl}/api/auth/mobile/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200, "customer login should succeed");
  const restricted = await login.json();
  const restrictedNegotiation = await fetch(
    `${hubUrl}/negotiate?negotiateVersion=1&access_token=${encodeURIComponent(restricted.accessToken)}`,
    { method: "POST" },
  );
  assert.equal(
    restrictedNegotiation.status,
    403,
    "restricted customer sessions should not authenticate the hub",
  );
  const changed = await fetch(`${input.baseUrl}/api/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${restricted.accessToken}`,
    },
    body: JSON.stringify({
      currentPassword: password,
      newPassword: input.changedPassword,
    }),
  });
  assert.equal(
    changed.status,
    200,
    "initial customer password change should succeed",
  );
  return (await changed.json()).accessToken;
}

const staffSession = await webSession(input.staffEmail, input.initialPassword);
const customerSessionData = await customerSession(
  input.customerEmail,
  input.initialPassword,
);
const strangerSessionData = await customerSession(
  input.strangerEmail,
  input.initialPassword,
);
const customerToken = customerSessionData;
const strangerToken = strangerSessionData;
function connect(options) {
  return new HubConnectionBuilder()
    .withUrl(hubUrl, { ...options, transport: HttpTransportType.WebSockets })
    .configureLogging(LogLevel.None)
    .build();
}
function waitFor(connection, event, predicate = () => true, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      timeoutMs,
    );
    connection.on(event, (payload) => {
      if (predicate(payload)) {
        clearTimeout(timer);
        resolve(payload);
      }
    });
  });
}

const staff = connect({ headers: { Cookie: staffSession.cookie } });
const customer = connect({ accessTokenFactory: () => customerToken });
const stranger = connect({ accessTokenFactory: () => strangerToken });
try {
  const anonymousNegotiation = await fetch(
    `${hubUrl}/negotiate?negotiateVersion=1`,
    { method: "POST" },
  );
  assert.equal(
    anonymousNegotiation.status,
    401,
    "anonymous hub negotiation should be rejected",
  );
  const tokenNegotiation = await fetch(
    `${hubUrl}/negotiate?negotiateVersion=1&access_token=${encodeURIComponent(customerToken)}`,
    { method: "POST" },
  );
  assert.equal(
    tokenNegotiation.status,
    200,
    "bearer token in hub query should authenticate negotiation",
  );
  const tokenOutsideHub = await fetch(
    `${input.baseUrl}/api/reports?access_token=${encodeURIComponent(customerToken)}`,
  );
  assert.equal(
    tokenOutsideHub.status,
    401,
    "query bearer token should not authenticate non-hub routes",
  );
  const foreignOrigin = await fetch(
    `${hubUrl}/negotiate?negotiateVersion=1&access_token=${encodeURIComponent(customerToken)}`,
    {
      method: "POST",
      headers: { Origin: "https://untrusted.example" },
    },
  );
  assert.equal(
    foreignOrigin.status,
    403,
    "hub negotiation should reject an untrusted Origin",
  );

  await Promise.all([staff.start(), customer.start(), stranger.start()]);
  const queueCreated = waitFor(staff, "ReportCreated");
  const created = await fetch(`${input.baseUrl}/api/reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({
      issueType: "NoWater",
      description: "Realtime integration report",
      address: {
        regionCode: "0100000000",
        provinceCode: "0102800000",
        cityMunicipalityCode: "0102801000",
        barangayCode: "0102801001",
        details: "Near the old bridge",
      },
      latitude: 14.5,
      longitude: 121.2,
    }),
  });
  assert.equal(created.status, 201, "customer report should be created");
  const report = await created.json();
  assert.equal(
    (await queueCreated).id,
    report.id,
    "staff queue should receive committed report",
  );

  await customer.invoke("Subscribe", report.id);
  await assert.rejects(
    stranger.invoke("Subscribe", report.id),
    /Ticket is unavailable/,
  );
  const ticketUpdate = waitFor(
    customer,
    "TicketUpdated",
    (item) => item.id === report.id,
  );
  const claimed = await fetch(
    `${input.baseUrl}/api/staff/reports/${report.id}/claim`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: staffSession.cookie,
        "X-CSRF-TOKEN": staffSession.csrf,
      },
      body: "{}",
    },
  );
  assert.equal(claimed.status, 200, "staff should claim report");
  await ticketUpdate;

  const customerMessage = waitFor(
    customer,
    "MessageCreated",
    (message) => message.reportId === report.id,
  );
  const sent = await fetch(
    `${input.baseUrl}/api/staff/reports/${report.id}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: staffSession.cookie,
        "X-CSRF-TOKEN": staffSession.csrf,
      },
      body: JSON.stringify({ body: "Supplier is checking." }),
    },
  );
  assert.equal(sent.status, 200, "assigned staff should send a message");
  const delivered = await customerMessage;
  assert.equal(delivered.body, "Supplier is checking.");

  await customer.stop();
  const offlineMessage = await fetch(
    `${input.baseUrl}/api/reports/${report.id}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({ body: "I sent this while disconnected." }),
    },
  );
  assert.equal(
    offlineMessage.status,
    200,
    "customer message should persist while disconnected",
  );
  const customerRestarted = connect({
    accessTokenFactory: () => customerToken,
  });
  await customerRestarted.start();
  await customerRestarted.invoke("Subscribe", report.id);
  const recovered = await fetch(
    `${input.baseUrl}/api/reports/${report.id}/messages`,
    {
      headers: { Authorization: `Bearer ${customerToken}` },
    },
  );
  assert.equal(
    recovered.status,
    200,
    "REST should recover messages after reconnect",
  );
  const history = await recovered.json();
  assert.equal(history.items[0].body, "Supplier is checking.");
  assert.equal(history.items[1].body, "I sent this while disconnected.");
  assert.equal(
    history.items[0].id,
    delivered.id,
    "realtime message should exist in committed REST history",
  );
  await customerRestarted.stop();
  console.log("Realtime report hub integration passed.");
} finally {
  await Promise.all([staff.stop(), customer.stop(), stranger.stop()]);
}
