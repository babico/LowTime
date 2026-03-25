import test from "node:test";
import assert from "node:assert/strict";

import { assessNetworkHealth, getNetworkHealthLabel } from "./network-health.js";

test("assessNetworkHealth returns offline when browser is offline", () => {
  assert.equal(
    assessNetworkHealth({
      callStatus: "connected",
      isOnline: false,
    }),
    "offline",
  );
});

test("assessNetworkHealth returns reconnecting before the call is fully connected", () => {
  assert.equal(
    assessNetworkHealth({
      callStatus: "connecting",
      isOnline: true,
    }),
    "reconnecting",
  );
});

test("assessNetworkHealth returns poor for weak connection indicators", () => {
  assert.equal(
    assessNetworkHealth({
      callStatus: "connected",
      isOnline: true,
      effectiveType: "2g",
    }),
    "poor",
  );

  assert.equal(
    assessNetworkHealth({
      callStatus: "connected",
      isOnline: true,
      rtt: 900,
    }),
    "poor",
  );
});

test("assessNetworkHealth returns fair for moderate connection indicators", () => {
  assert.equal(
    assessNetworkHealth({
      callStatus: "connected",
      isOnline: true,
      effectiveType: "3g",
    }),
    "fair",
  );

  assert.equal(
    assessNetworkHealth({
      callStatus: "connected",
      isOnline: true,
      rtt: 300,
    }),
    "fair",
  );
});

test("assessNetworkHealth returns good for healthy connected state", () => {
  assert.equal(
    assessNetworkHealth({
      callStatus: "connected",
      isOnline: true,
      effectiveType: "4g",
      rtt: 100,
    }),
    "good",
  );
});

test("getNetworkHealthLabel maps statuses to user-facing copy", () => {
  assert.equal(getNetworkHealthLabel("good"), "Good network");
  assert.equal(getNetworkHealthLabel("fair"), "Fair network");
  assert.equal(getNetworkHealthLabel("poor"), "Poor network");
  assert.equal(getNetworkHealthLabel("reconnecting"), "Reconnecting");
  assert.equal(getNetworkHealthLabel("offline"), "Offline");
});
