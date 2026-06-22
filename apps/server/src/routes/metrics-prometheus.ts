import type { FastifyInstance } from "fastify";

import type { RouteContext } from "../server-support.js";
import { toPrometheusText } from "../domain/metrics-prometheus.js";

/**
 * Prometheus exposition endpoint (Issue #36, slice 1).
 *
 * Renders the current counter snapshot as Prometheus text format
 * so a scraper can pick it up. Content-Type follows the
 * Prometheus 0.0.4 text exposition convention.
 */
export function registerPrometheusMetricsRoute(app: FastifyInstance, context: RouteContext) {
  app.get<{ Reply: string }>("/metrics", async (_request, reply) => {
    reply.type("text/plain; version=0.0.4; charset=utf-8");
    return toPrometheusText(context.metrics.snapshot());
  });
}
