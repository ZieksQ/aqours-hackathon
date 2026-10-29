import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { connectReport } from "../src/features/reports/realtime.ts";

class Connection {
  events = new Map();
  starts = 0;
  stops = 0;
  subscriptions = [];
  on(event, callback) {
    this.events.set(event, callback);
  }
  off(event) {
    this.events.delete(event);
  }
  onclose(callback) {
    this.closed = callback;
  }
  async start() {
    this.starts++;
  }
  async stop() {
    this.stops++;
    this.closed?.();
  }
  async invoke(...args) {
    this.subscriptions.push(args);
  }
  emit(event) {
    this.events.get(event)?.();
  }
}

test("live staff replies refresh paged messages without losing older history or duplicating messages", async (t) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  t.after(() => client.clear());
  const key = ["messages", "customer", "report-1"];
  const older = { id: "old-message", body: "Earlier reply" };
  const recent = { id: "recent-message", body: "Customer reply" };
  const incoming = { id: "new-message", body: "Staff live reply" };
  let latest = [recent];
  client.setQueryData(key, {
    pages: [
      { items: latest, nextBefore: 10 },
      { items: [older], nextBefore: null },
    ],
    pageParams: [null, 10],
  });
  const observer = new InfiniteQueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      pageParam === null
        ? { items: latest, nextBefore: 10 }
        : { items: [older], nextBefore: null },
    getNextPageParam: (page) => page.nextBefore ?? undefined,
  });
  t.after(observer.subscribe(() => {}));
  const connection = new Connection();
  const disconnect = connectReport(connection, "report-1", () => {
    void client.invalidateQueries({ queryKey: key });
  });
  t.after(disconnect);
  await setImmediate();
  assert.deepEqual(connection.subscriptions, [["Subscribe", "report-1"]]);
  latest = [recent, incoming];
  connection.emit("MessageCreated");
  await setImmediate();
  assert.deepEqual(
    client.getQueryData(key).pages.flatMap((page) => page.items),
    [recent, incoming, older],
  );
  connection.emit("MessageCreated");
  await setImmediate();
  assert.equal(
    client
      .getQueryData(key)
      .pages[0].items.filter((message) => message.id === incoming.id).length,
    1,
  );
});

test("status events refresh report state and reconnect resubscribes before catching up", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const connection = new Connection();
  let refreshes = 0;
  t.after(connectReport(connection, "owned-report", () => refreshes++));
  await setImmediate();
  assert.equal(refreshes, 1);
  connection.emit("TicketUpdated");
  assert.equal(refreshes, 2);
  connection.closed();
  t.mock.timers.tick(1000);
  await setImmediate();
  assert.equal(connection.starts, 2);
  assert.deepEqual(connection.subscriptions, [
    ["Subscribe", "owned-report"],
    ["Subscribe", "owned-report"],
  ]);
  assert.equal(refreshes, 3);
});

test("an initial offline connection retries without manual refresh", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const connection = new Connection();
  connection.start = async () => {
    if (++connection.starts === 1) throw new Error("offline");
  };
  let refreshes = 0;
  t.after(connectReport(connection, "owned-report", () => refreshes++));
  await setImmediate();
  assert.equal(refreshes, 0);
  t.mock.timers.tick(1000);
  await setImmediate();
  assert.equal(connection.starts, 2);
  assert.equal(refreshes, 1);
});

test("a failed subscription retries and never reports the connection as caught up", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const connection = new Connection();
  connection.invoke = async (...args) => {
    connection.subscriptions.push(args);
    if (connection.subscriptions.length === 1)
      throw new Error("connection dropped");
  };
  let refreshes = 0;
  t.after(connectReport(connection, "owned-report", () => refreshes++));
  await setImmediate();
  assert.equal(refreshes, 0);
  t.mock.timers.tick(1000);
  await setImmediate();
  assert.equal(refreshes, 1);
});

test("leaving the conversation cancels retries and ignores late events", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const connection = new Connection();
  let refreshes = 0;
  const disconnect = connectReport(
    connection,
    "owned-report",
    () => refreshes++,
  );
  await setImmediate();
  const lateMessage = connection.events.get("MessageCreated");
  connection.closed();
  disconnect();
  lateMessage();
  t.mock.timers.tick(30000);
  await setImmediate();
  assert.equal(refreshes, 1);
  assert.equal(connection.starts, 1);
  assert.equal(connection.events.size, 0);
});

test("leaving during connection startup does not subscribe or refresh afterward", async () => {
  const connection = new Connection();
  let finish;
  connection.start = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const disconnect = connectReport(connection, "owned-report", () =>
    assert.fail("Disposed connection refreshed"),
  );
  disconnect();
  finish();
  await setImmediate();
  assert.deepEqual(connection.subscriptions, []);
});
