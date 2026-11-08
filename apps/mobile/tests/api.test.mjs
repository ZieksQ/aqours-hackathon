import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiClient, ApiError } from "../src/shared/api.ts";

const originalFetch = globalThis.fetch;
const originalFormData = globalThis.FormData;
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.FormData = originalFormData;
});

class TestFormData {
  fields = [];

  append(name, value, fileName) {
    this.fields.push({ name, value, fileName });
  }

  get(name) {
    return this.fields.find((field) => field.name === name)?.value ?? null;
  }

  getAll(name) {
    return this.fields
      .filter((field) => field.name === name)
      .map((field) => field.value);
  }
}

function session(overrides = {}) {
  return {
    account: {
      id: "customer-1",
      email: "customer@example.com",
      firstName: "Mia",
      lastName: "Santos",
      role: "Customer",
      requiresPasswordChange: false,
    },
    accessToken: "access-1",
    accessTokenExpiresAt: new Date(Date.now() + 60000).toISOString(),
    refreshToken: "refresh-1",
    refreshTokenExpiresAt: new Date(Date.now() + 120000).toISOString(),
    ...overrides,
  };
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });

test("login uses the mobile contract and owner-scoped requests carry the bearer token", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    return json(url.endsWith("login") ? session() : { items: [] });
  };
  const api = new ApiClient("http://supplier.test///");
  await api.login("customer@example.com", "password");
  await api.request("/reports?page=1&pageSize=1");
  assert.equal(calls[0].url, "http://supplier.test/api/auth/mobile/login");
  assert.deepEqual(JSON.parse(calls[0].body), {
    email: "customer@example.com",
    password: "password",
  });
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[1].headers.Authorization, "Bearer access-1");
  assert.equal(api.getSession().account.id, "customer-1");
});

test("invalid credentials, missing configuration, and network failures never create a session", async () => {
  const api = new ApiClient("http://supplier.test");
  globalThis.fetch = async () => new Response(null, { status: 401 });
  await assert.rejects(
    api.login("customer@example.com", "bad"),
    (error) => error instanceof ApiError && error.status === 401,
  );
  assert.equal(api.getSession(), null);
  await assert.rejects(
    new ApiClient("").login("a", "b"),
    /EXPO_PUBLIC_API_URL/,
  );
  globalThis.fetch = async () => {
    throw new TypeError("network failed");
  };
  await assert.rejects(api.login("a", "b"), /Check your connection/);
  assert.equal(api.getSession(), null);
});

test("first-login password change replaces the restricted session with the returned full session", async () => {
  const restricted = session({
    refreshToken: null,
    account: { ...session().account, requiresPasswordChange: true },
  });
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("login")) return json(restricted);
    assert.equal(url, "http://supplier.test/api/auth/change-password");
    assert.deepEqual(JSON.parse(options.body), {
      currentPassword: "temporary",
      newPassword: "new-password",
    });
    return json(session({ accessToken: "full-access" }));
  };
  const api = new ApiClient("http://supplier.test");
  await api.login("customer@example.com", "temporary");
  assert.equal(api.getSession().account.requiresPasswordChange, true);
  await api.changePassword("temporary", "new-password");
  assert.equal(api.getSession().account.requiresPasswordChange, false);
  assert.equal(api.getSession().accessToken, "full-access");
});

test("concurrent requests rotate an expired refresh token only once", async () => {
  let refreshCount = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("login"))
      return json(session({ accessTokenExpiresAt: "2000-01-01T00:00:00Z" }));
    if (url.endsWith("refresh")) {
      refreshCount++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      assert.deepEqual(JSON.parse(options.body), { refreshToken: "refresh-1" });
      return json(
        session({ accessToken: "access-2", refreshToken: "refresh-2" }),
      );
    }
    assert.equal(options.headers.Authorization, "Bearer access-2");
    return json({ items: [] });
  };
  const api = new ApiClient("http://supplier.test");
  await api.login("a", "b");
  await Promise.all([api.request("/reports"), api.request("/reports")]);
  assert.equal(refreshCount, 1);
});

test("a 401 retries once with refreshed credentials and clears a rejected session", async () => {
  let reads = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("login")) return json(session());
    if (url.endsWith("refresh"))
      return json(session({ accessToken: "access-2" }));
    reads++;
    return new Response(null, { status: 401 });
  };
  const api = new ApiClient("http://supplier.test");
  await api.login("a", "b");
  await assert.rejects(
    api.request("/reports"),
    (error) => error.status === 401,
  );
  assert.equal(reads, 2);
  assert.equal(api.getSession(), null);
});

test("offline sign-out clears local credentials before the revocation request fails", async () => {
  globalThis.fetch = async () => json(session());
  const api = new ApiClient("http://supplier.test");
  await api.login("a", "b");
  globalThis.fetch = async (_url, options) => {
    assert.equal(api.getSession(), null);
    assert.equal(options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(options.body), { refreshToken: "refresh-1" });
    throw new Error("offline");
  };
  await assert.rejects(api.logout(), /Cannot reach/);
  assert.equal(api.getSession(), null);
});

test("a delayed refresh cannot restore credentials after sign-out", async () => {
  let finishRefresh;
  globalThis.fetch = async (url) => {
    if (url.endsWith("login"))
      return json(session({ accessTokenExpiresAt: "2000-01-01T00:00:00Z" }));
    if (url.endsWith("refresh"))
      return new Promise((resolve) => {
        finishRefresh = () =>
          resolve(json(session({ accessToken: "access-2" })));
      });
    if (url.endsWith("logout")) return new Response(null, { status: 204 });
    assert.fail("Report request must not be sent after sign-out");
  };
  const api = new ApiClient("http://supplier.test");
  await api.login("a", "b");
  const read = api.request("/reports");
  await api.logout();
  finishRefresh();
  await assert.rejects(read, /session expired/);
  assert.equal(api.getSession(), null);
});

test("validation messages are surfaced and private server error details are hidden", async () => {
  const api = new ApiClient("http://supplier.test");
  globalThis.fetch = async () =>
    json({ errors: { password: ["Use 12 characters."] } }, 400);
  await assert.rejects(api.login("a", "b"), /Use 12 characters/);
  globalThis.fetch = async () =>
    json({ detail: "private database error" }, 500);
  await assert.rejects(
    api.login("a", "b"),
    (error) => !error.message.includes("database") && error.status === 500,
  );
});

test("live connections share token rotation with concurrent REST requests", async () => {
  let refreshes = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("login"))
      return json(session({ accessTokenExpiresAt: "2000-01-01T00:00:00Z" }));
    if (url.endsWith("refresh")) {
      refreshes++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return json(session({ accessToken: "renewed-access" }));
    }
    assert.equal(options.headers.Authorization, "Bearer renewed-access");
    return json({ items: [] });
  };
  const api = new ApiClient("http://supplier.test");
  await api.login("a", "b");
  const [token] = await Promise.all([
    api.getAccessToken(),
    api.request("/reports"),
  ]);
  assert.equal(token, "renewed-access");
  assert.equal(refreshes, 1);
});

test("live connections cannot reuse a token after sign-out", async () => {
  globalThis.fetch = async () => json(session());
  const api = new ApiClient("http://supplier.test");
  await api.login("a", "b");
  assert.equal(await api.getAccessToken(), "access-1");
  await api.logout();
  await assert.rejects(api.getAccessToken(), (error) => error.status === 401);
});

test("multipart request factories rebuild repeated files for one known 401 retry", async () => {
  globalThis.FormData = TestFormData;
  const sends = [];
  globalThis.fetch = async (url, options) => {
    if (url.endsWith("login")) return json(session());
    if (url.endsWith("refresh"))
      return json(session({ accessToken: "access-2", refreshToken: "refresh-2" }));
    assert.equal(url, "http://supplier.test/api/reports/owned/messages");
    sends.push({ url, ...options });
    return sends.length === 1
      ? new Response(null, { status: 401 })
      : json({ id: "message-1" });
  };
  const api = new ApiClient("http://supplier.test");
  await api.login("a", "b");
  let builds = 0;
  const message = await api.request(
    "/reports/owned/messages",
    () => {
      builds++;
      const form = new TestFormData();
      form.append("body", "The pipe is still leaking.");
      form.append("files", {
        uri: "file:///first.jpg",
        name: "first.jpg",
        type: "image/jpeg",
      });
      form.append("files", {
        uri: "file:///second.png",
        name: "second.png",
        type: "image/png",
      });
      return form;
    },
    true,
    true,
    undefined,
    60000,
  );
  assert.deepEqual(message, { id: "message-1" });
  assert.equal(builds, 2);
  assert.equal(sends.length, 2);
  assert.notEqual(sends[0].body, sends[1].body);
  assert.equal(sends[0].headers.Authorization, "Bearer access-1");
  assert.equal(sends[1].headers.Authorization, "Bearer access-2");
  assert.equal(sends[0].headers["Content-Type"], undefined);
  assert.equal(sends[1].headers["Content-Type"], undefined);
  assert.equal(sends[0].credentials, "omit");
  assert.equal(sends[1].body.get("body"), "The pipe is still leaking.");
  assert.deepEqual(
    sends[1].body.getAll("files").map((file) => file.name),
    ["first.jpg", "second.png"],
  );
});

test("expired image credentials use the shared refresh and retry only with a changed token", async () => {
  let refreshes = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("login"))
      return json(session({ accessTokenExpiresAt: "2000-01-01T00:00:00Z" }));
    if (url.endsWith("refresh")) {
      refreshes++;
      return json(session({ accessToken: "access-2", refreshToken: "refresh-2" }));
    }
    assert.fail("No image GET is sent by the token refresh helper");
  };
  const api = new ApiClient("http://supplier.test");
  await api.login("a", "b");
  assert.equal(
    await api.getAccessTokenAfterImageFailure("access-1"),
    "access-2",
  );
  assert.equal(refreshes, 1);
  assert.equal(await api.getAccessTokenAfterImageFailure("access-2"), null);
  assert.equal(refreshes, 1);
});
