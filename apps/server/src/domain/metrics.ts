/**
 * In-process metrics registry for LowTime (Issue #31).
 *
 * Counters only ÔÇö enough to back the group-beta validation KPIs in
 * `docs/10-observability-and-operations.md`. Prometheus export and
 * OpenTelemetry traces are tracked as separate follow-up issues.
 *
 * Public surface:
 *   - `recordEvent(name, tags)` is a pure helper that returns the
 *     event object the registry expects.
 *   - `incrementCounter(name, tags)` is a pure helper that returns
 *     the canonical counter key the registry uses.
 *   - `MetricsRegistry.record(event)` and `snapshot()` are the only
 *     stateful methods.
 *
 * The registry ignores unknown event names so a typo in a call site
 * cannot poison the dashboard with garbage counter keys.
 */

export const KNOWN_METRICS_EVENTS = [
  "room_created",
  "join_succeeded",
  "join_rejected",
  "lobby_decision",
  "p2p_fallback_triggered",
  "passcode_failure",
  "session_expired",
  "reconnect_recovered",
] as const;

export type MetricsEventName = (typeof KNOWN_METRICS_EVENTS)[number];

export interface MetricsEvent {
  name: MetricsEventName;
  tags: Record<string, string>;
}

export interface MetricsSnapshot {
  counters: Record<string, number>;
  emittedAt: string;
}

export interface MetricsRegistry {
  record(event: MetricsEvent): void;
  snapshot(): MetricsSnapshot;
  reset(): void;
}

export function recordEvent(name: MetricsEventName, tags: Record<string, string> = {}): MetricsEvent {
  return { name, tags };
}

export function incrementCounter(name: MetricsEventName, tags: Record<string, string> = {}): string {
  return buildKey(name, tags);
}

function buildKey(name: string, tags: Record<string, string> | undefined): string {
  if (tags == null) {
    return name;
  }

  const entries = Object.entries(tags)
    .filter(([, value]) => typeof value === "string" && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);

  if (entries.length === 0) {
    return name;
  }
  return `${name}{${entries.join(",")}}`;
}

function isKnownEventName(name: string): name is MetricsEventName {
  return (KNOWN_METRICS_EVENTS as readonly string[]).includes(name);
}

export function createInMemoryMetrics(now: () => Date = () => new Date()): MetricsRegistry {
  const counters = new Map<string, number>();

  return {
    record(event) {
      if (!isKnownEventName(event.name)) {
        return;
      }
      const key = buildKey(event.name, event.tags);
      counters.set(key, (counters.get(key) ?? 0) + 1);
    },
    snapshot() {
      const sortedKeys = [...counters.keys()].sort();
      const out: Record<string, number> = {};
      for (const key of sortedKeys) {
        out[key] = counters.get(key) ?? 0;
      }
      return { counters: out, emittedAt: now().toISOString() };
    },
    reset() {
      counters.clear();
    },
  };
}
