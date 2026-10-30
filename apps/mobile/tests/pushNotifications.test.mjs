import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, test } from "node:test";

const runtime = { expoGo: true, platform: "android", imports: 0 };
globalThis.aqoursPushTestRuntime = runtime;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const sources = {
      expo: "export const isRunningInExpoGo = () => globalThis.aqoursPushTestRuntime.expoGo;",
      "react-native":
        "export const Platform = { get OS() { return globalThis.aqoursPushTestRuntime.platform; } };",
      "expo-notifications":
        "globalThis.aqoursPushTestRuntime.imports++; throw new Error(\"Cannot find native module 'ExpoTopicSubscriptionModule'\");",
    };
    if (Object.hasOwn(sources, specifier)) {
      return {
        url: `data:text/javascript,${encodeURIComponent(sources[specifier])}`,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
after(() => {
  hooks.deregister();
  delete globalThis.aqoursPushTestRuntime;
});

const { loadPushNotifications } =
  await import("../src/shared/pushNotifications.ts");

test("Expo Go never evaluates the native notification package on Android or iOS", async () => {
  for (const platform of ["android", "ios"]) {
    runtime.platform = platform;
    assert.equal(await loadPushNotifications(), null);
  }
  assert.equal(runtime.imports, 0);
});

test("web never evaluates the native notification package", async () => {
  runtime.expoGo = false;
  runtime.platform = "web";
  assert.equal(await loadPushNotifications(), null);
  assert.equal(runtime.imports, 0);
});

test("a missing native module outside Expo Go leaves in-app Updates available", async () => {
  runtime.expoGo = false;
  runtime.platform = "android";
  assert.equal(await loadPushNotifications(), null);
  assert.equal(runtime.imports, 1);
});
