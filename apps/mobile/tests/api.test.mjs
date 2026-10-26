import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiClient, ApiError } from "../src/shared/api.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

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
