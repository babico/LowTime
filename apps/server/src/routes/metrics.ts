import type { FastifyInstance } from "fastify";

import type { RouteContext } from "../server-support.js";
import type { MetricsSnapshot } from "../domain/metrics.js";

/**
 * Read-only metrics summary endpoint (Issue #31).
 *
 * Returns the current counter snapshot in a stable JSON shape so a
 * dashboard can poll it without needing the Prometheus exporter
 * yet. Prometheus export is tracked as a separate follow-up issue.
 */
export function registerMetricsRoutes(app: FastifyInstance, context: RouteContext) {
  app.get<{ Reply: MetricsSnapshot }>("/api/metrics/summary", async () => {
    return context.metrics.snapshot();
  });
}
