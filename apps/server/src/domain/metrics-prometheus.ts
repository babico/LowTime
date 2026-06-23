import type { MetricsSnapshot } from "./metrics.js";

/**
 * Render a `MetricsSnapshot` as a Prometheus exposition body
 * (text/plain; version 0.0.4). Pure so it can be tested without a
 * live registry. No new dependency ÔÇö the format is small and
 * stable.
 *
 * Conventions:
 *   - The metric name is the part before `{` (or the whole key when
 *     there are no labels).
 *   - Label pairs are alphabetized in the output.
 *   - Unlabelled counters come last in a group.
 *   - Label values are escaped per the Prometheus text format:
 *     backslash ÔåÆ `\\`, double quote ÔåÆ `\"`, newline ÔåÆ `\n`.
 *   - A single meta counter `lowtime_metrics_emitted_at_seconds`
 *     exposes the snapshot timestamp so a scraper can detect a
 *     silent registry.
 */

const ESCAPE_MAP: Record<string, string> = {
  "\\": "\\\\",
  "\"": "\\\"",
  "\n": "\\n",
};

function escapeLabelValue(value: string): string {
  return value.replace(/[\\"\n]/g, (char) => ESCAPE_MAP[char] ?? char);
}

function splitKey(key: string): { baseName: string; labels: string } | { baseName: string } {
  const open = key.indexOf("{");
  if (open === -1) {
    return { baseName: key };
  }
  const close = key.lastIndexOf("}");
  if (close <= open) {
    return { baseName: key };
  }
  return {
    baseName: key.slice(0, open),
    labels: key.slice(open + 1, close),
  };
}

function formatKey(baseName: string, labelPairs: Array<[string, string]>): string {
  if (labelPairs.length === 0) {
    return baseName;
  }
  const rendered = labelPairs
    .map(([name, value]) => `${name}="${escapeLabelValue(value)}"`)
    .join(",");
  return `${baseName}{${rendered}}`;
}

interface Group {
  baseName: string;
  labelled: Array<{ pairs: Array<[string, string]>; value: number }>;
  unlabelledValue: number | null;
}

function buildGroups(snapshot: MetricsSnapshot): Group[] {
  const groups = new Map<string, Group>();

  for (const [key, value] of Object.entries(snapshot.counters)) {
    const parts = splitKey(key);
    const baseName = "baseName" in parts ? parts.baseName : "";

    let group = groups.get(baseName);
    if (group == null) {
      group = { baseName, labelled: [], unlabelledValue: null };
      groups.set(baseName, group);
    }

    if ("labels" in parts && parts.labels !== undefined) {
      const pairs = parts.labels
        .split(",")
        .map((pair) => {
          const eq = pair.indexOf("=");
          if (eq === -1) {
            return null;
          }
          return [pair.slice(0, eq), pair.slice(eq + 1)] as [string, string];
        })
        .filter((pair): pair is [string, string] => pair != null);
      group.labelled.push({ pairs, value });
    } else {
      group.unlabelledValue = value;
    }
  }

  return [...groups.values()].sort((a, b) => a.baseName.localeCompare(b.baseName));
}

function formatLine(baseName: string, labelPairs: Array<[string, string]>, value: number): string {
  return `${formatKey(baseName, labelPairs)} ${value}`;
}

function renderBody(groups: Group[]): string {
  const lines: string[] = [];

  for (const group of groups) {
    lines.push(`# HELP ${group.baseName} Counters from the LowTime metrics registry`);
    lines.push(`# TYPE ${group.baseName} counter`);

    const sortedLabelled = [...group.labelled].sort((a, b) => {
      const keyA = a.pairs.map(([n, v]) => `${n}=${v}`).join(",");
      const keyB = b.pairs.map(([n, v]) => `${n}=${v}`).join(",");
      return keyA.localeCompare(keyB);
    });

    for (const entry of sortedLabelled) {
      lines.push(formatLine(group.baseName, entry.pairs, entry.value));
    }

    if (group.unlabelledValue != null) {
      lines.push(formatLine(group.baseName, [], group.unlabelledValue));
    }
  }

  return lines.join("\n");
}

export function toPrometheusText(snapshot: MetricsSnapshot): string {
  const groups = buildGroups(snapshot);
  const body = renderBody(groups);
  const meta = `# HELP lowtime_metrics_emitted_at_seconds Unix epoch in seconds when the snapshot was rendered
# TYPE lowtime_metrics_emitted_at_seconds gauge
lowtime_metrics_emitted_at_seconds ${Math.floor(new Date(snapshot.emittedAt).getTime() / 1000)}`;

  if (body.length === 0) {
    return meta;
  }
  return `${body}\n${meta}`;
}
