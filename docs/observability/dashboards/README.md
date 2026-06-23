# Observability Dashboards

This directory holds Grafana dashboard JSON exports that consume the
counters the LowTime server exposes on `GET /metrics` (see
`apps/server/src/routes/metrics-prometheus.ts`).

## Available Dashboards

- **`lowtime-overview.json`** — single-page overview covering the
  four phase-5 KPIs (room creations, join success, join rejected,
  P2P fallback triggered), the passcode-failure counter, the
  per-accessMode breakdown of room creations, and a
  scrape-liveness panel that watches
  `lowtime_metrics_emitted_at_seconds`.

## Importing

The dashboard JSON is the standard Grafana model and imports
without any provider-specific extension. Two paths:

1. **Grafana UI** — Dashboards > New > Import > upload the JSON
   file (or paste the content). The dashboard lands with the
   `lowtime-overview` uid and the `LowTime` title so re-imports
   overwrite the existing copy.
2. **Grafana provisioning** — drop the file under
   `/etc/grafana/provisioning/dashboards/` with a matching
   provider that watches the directory. The compose stack in
   this repo does not include Grafana yet; once it lands the
   dashboards land in the same image.

## Counters The Dashboards Read

The dashboards only query counter names the `/metrics` endpoint
emits. The set is the `KNOWN_METRICS_EVENTS` union in
`apps/server/src/domain/metrics.ts` plus the synthetic
`lowtime_metrics_emitted_at_seconds` gauge the Prometheus
exporter adds. The test in
`apps/server/src/observability-dashboard.test.ts` enforces the
allowlist so a typo on the dashboard side cannot ship.

## Alerts

Prometheus alertmanager is not part of the project yet. The
team's spec for alerts is in `docs/10-observability-and-operations.md`:

- Join success drops below threshold for 10 minutes.
- SFU token issuance failures spike.
- TURN relay usage spikes unexpectedly.
- Room creation bursts exceed abuse thresholds.
- Redis errors or latency affect signaling or lobby flows.

When the team is ready to wire alertmanager, copy
`lowtime-overview.json` into a sibling `alerts.json` and drop it
in the alertmanager rules directory. The queries are already
there; the rules file is a one-time copy.
