import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dashboardPath = resolve(here, "../../../docs/observability/dashboards/lowtime-overview.json");

function loadDashboard(): {
  title: string;
  uid: string;
  panels: Array<{ id: number; type: string; title: string; targets: Array<{ expr: string }> }>;
} {
  const raw = readFileSync(dashboardPath, "utf-8");
  return JSON.parse(raw);
}

describe("lowtime-overview dashboard", () => {
  test("is valid JSON with a stable uid and the expected title", () => {
    const dash = loadDashboard();
    assert.equal(dash.title, "LowTime Overview");
    assert.equal(dash.uid, "lowtime-overview");
  });

  test("has 9 panels covering the 4 phase-5 KPIs", () => {
    const dash = loadDashboard();
    assert.equal(dash.panels.length, 9);
    const titles = dash.panels.map((panel) => panel.title);
    assert.ok(titles.includes("Room creations (5m)"));
    assert.ok(titles.includes("Join success (5m)"));
    assert.ok(titles.includes("Join rejected (5m)"));
    assert.ok(titles.includes("P2P fallback triggered (5m)"));
  });

  test("uses only counters the /metrics endpoint actually emits", () => {
    const dash = loadDashboard();
    const expected = new Set([
      "room_created",
      "join_succeeded",
      "join_rejected",
      "p2p_fallback_triggered",
      "passcode_failure",
      "lowtime_metrics_emitted_at_seconds",
    ]);
    for (const panel of dash.panels) {
      for (const target of panel.targets) {
        // Every metric name in the query should be in the set.
        const usedNames = Array.from(target.expr.matchAll(/\b([a-z_]+)\b/g)).map((m) => m[1]);
        for (const name of usedNames) {
          if (name === "sum" || name === "rate" || name === "by" || name === "time" || name === "state" || name === "reason" || name === "accessMode") {
            continue;
          }
          assert.ok(expected.has(name), `Unexpected metric ${name} in panel ${panel.title}`);
        }
      }
    }
  });
});
