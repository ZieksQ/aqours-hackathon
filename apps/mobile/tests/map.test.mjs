import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import {
  createMapHtml,
  parseMapMessage,
} from "../src/features/reports/leaflet-map.ts";

function mapHarness(coordinates = null, interactive = true) {
  const messages = [];
  const mapEvents = {};
  const tileEvents = {};
  let marker;
  const map = {
    setView: () => {},
    on: (event, callback) => {
      mapEvents[event] = callback;
    },
    invalidateSize: () => {},
  };
  const L = {
    map: () => map,
    divIcon: () => ({}),
    marker: (position) => {
      marker = {
        position,
        events: {},
        addTo: function () {
          return this;
        },
        on: function (event, callback) {
          this.events[event] = callback;
        },
        setLatLng: function (point) {
          this.position = point;
        },
        getLatLng: function () {
          return {
            wrap: () => ({ lat: this.position[0], lng: this.position[1] }),
          };
        },
      };
      return marker;
    },
    tileLayer: () => ({
      on: (event, callback) => {
        tileEvents[event] = callback;
      },
      addTo: () => {},
    }),
  };
  const window = {
    ReactNativeWebView: {
      postMessage: (data) => messages.push(JSON.parse(data)),
    },
    addEventListener: () => {},
  };
  const html = createMapHtml({
    apiKey: "test-client-key",
    coordinates,
    interactive,
  });
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  vm.runInNewContext(inline, { window, L });
  window.startAqoursMap();
  return { messages, mapEvents, tileEvents, getMarker: () => marker };
}

test("bridge accepts finite, bounded selected locations and rejects malformed messages", () => {
  for (const type of ["loading", "loaded", "error"])
    assert.deepEqual(parseMapMessage(JSON.stringify({ type })), { type });
  assert.deepEqual(
    parseMapMessage('{"type":"select","latitude":14.6,"longitude":121}'),
    { type: "select", latitude: 14.6, longitude: 121 },
  );
  for (const data of [
    "broken",
    "null",
    "[]",
    '{"type":["loaded"]}',
    '{"type":"unknown"}',
    '{"type":"select","latitude":"14","longitude":121}',
    '{"type":"select","latitude":91,"longitude":121}',
    '{"type":"select","latitude":14,"longitude":181}',
    '{"type":"select","latitude":1e400,"longitude":0}',
  ])
    assert.equal(parseMapMessage(data), null);
});

test("viewport and existing location never become a newly confirmed selection", () => {
  for (const point of [null, { latitude: 14.6, longitude: 121 }]) {
    const { messages } = mapHarness(point);
    assert.equal(
      messages.filter((message) => message.type === "select").length,
      0,
    );
  }
});

test("tap and drag selections reach native only after tiles load", () => {
  const { messages, mapEvents, tileEvents, getMarker } = mapHarness();
  const event = { latlng: { wrap: () => ({ lat: 14.6, lng: 121 }) } };
  mapEvents.click(event);
  assert.equal(getMarker(), undefined);
  tileEvents.loading();
  tileEvents.tileload();
  tileEvents.load();
  mapEvents.click(event);
  assert.deepEqual(messages.at(-1), {
    type: "select",
    latitude: 14.6,
    longitude: 121,
  });
  getMarker().setLatLng([15, 122]);
  getMarker().events.dragend();
  assert.deepEqual(messages.at(-1), {
    type: "select",
    latitude: 15,
    longitude: 122,
  });
  tileEvents.loading();
  getMarker().setLatLng([16, 123]);
  getMarker().events.dragend();
  assert.deepEqual(Array.from(getMarker().position), [15, 122]);
  assert.equal(messages.at(-1).type, "loading");
});

test("a failed tile keeps the map unavailable and prevents selecting an unseen location", () => {
  const { messages, mapEvents, tileEvents } = mapHarness();
  tileEvents.loading();
  tileEvents.tileerror();
  tileEvents.tileload();
  tileEvents.load();
  mapEvents.click({ latlng: { wrap: () => ({ lat: 14.6, lng: 121 }) } });
  assert.deepEqual(messages.at(-1), { type: "error" });
  assert.equal(
    messages.some((message) => message.type === "select"),
    false,
  );
  tileEvents.loading();
  tileEvents.tileload();
  tileEvents.load();
  assert.deepEqual(messages.at(-1), { type: "loaded" });
});

test("the compact preview never sends location selections", () => {
  const { messages, mapEvents, tileEvents } = mapHarness(null, false);
  tileEvents.loading();
  tileEvents.tileload();
  tileEvents.load();
  mapEvents.click({ latlng: { wrap: () => ({ lat: 14.6, lng: 121 }) } });
  assert.equal(
    messages.some((message) => message.type === "select"),
    false,
  );
});

test("embedded configuration cannot inject HTML and map credits are included", () => {
  const html = createMapHtml({
    apiKey: '</script><script>alert("key")</script>',
    coordinates: null,
    interactive: true,
  });
  assert.equal(html.includes("</script><script>alert"), false);
  assert.match(html, /leaflet@1\.9\.4/);
  assert.match(html, /integrity="sha256-/);
  assert.match(html, /https:\/\/maps\.geoapify\.com\/v1\/tile\/osm-bright/);
  for (const credit of [
    "Geoapify",
    "OpenStreetMap contributors",
    "OpenMapTiles",
  ])
    assert.ok(html.includes(credit));
});
