import type { NetworkHealth } from "../network-health.js";

export const callPageStyle = {
  display: "grid",
  gap: "1rem",
  padding: "1rem",
  maxWidth: "72rem",
  margin: "0 auto",
} as const;

export const installCardStyle = {
  display: "grid",
  gap: "0.75rem",
  background: "#e0f2fe",
  border: "1px solid #7dd3fc",
  borderRadius: "1rem",
  padding: "1rem",
  marginBottom: "1rem",
  maxWidth: "32rem",
} as const;

export const installHeadingStyle = {
  margin: 0,
} as const;

export const callHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  flexWrap: "wrap",
} as const;

export const callHeaderBadgeRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  flexWrap: "wrap",
} as const;

export const callLayoutStyle = {
  display: "grid",
  gap: "1rem",
} as const;

export const joinPreviewGridStyle = {
  display: "grid",
  gap: "1rem",
  marginBottom: "1rem",
} as const;

export const previewCardStyle = {
  display: "grid",
  gap: "1rem",
  padding: "1rem",
  borderRadius: "1rem",
  background: "#e2e8f0",
} as const;

export const previewPlaceholderStyle = {
  minHeight: "14rem",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  background: "#cbd5e1",
  borderRadius: "0.75rem",
  padding: "1rem",
} as const;

export const previewVideoStyle = {
  width: "100%",
  maxWidth: "24rem",
  aspectRatio: "16 / 10",
  objectFit: "cover",
  borderRadius: "0.75rem",
  background: "#0f172a",
} as const;

export const previewOptionsStyle = {
  display: "grid",
  gap: "0.75rem",
} as const;

export const hostQueueStyle = {
  display: "grid",
  gap: "0.75rem",
} as const;

export const hostQueueItemStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  flexWrap: "wrap",
  padding: "0.75rem 1rem",
  borderRadius: "0.75rem",
  background: "#f8fafc",
} as const;

export const toggleOptionStyle = {
  display: "grid",
  gap: "0.35rem",
} as const;

export const remoteTileStyle = {
  minHeight: "20rem",
  background: "#0f172a",
  color: "#f8fafc",
  borderRadius: "1rem",
  padding: "1rem",
  display: "grid",
  gap: "1rem",
} as const;

export const selfViewPanelStyle = {
  background: "#e2e8f0",
  borderRadius: "1rem",
  padding: "1rem",
  display: "grid",
  gap: "1rem",
} as const;

export const controlsPanelStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
} as const;

export const tileHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
} as const;

export const tileHeadingStyle = {
  margin: 0,
} as const;

export const tilePlaceholderStyle = {
  minHeight: "16rem",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  border: "1px dashed rgba(255, 255, 255, 0.35)",
  borderRadius: "0.75rem",
  padding: "1rem",
} as const;

export const selfPlaceholderStyle = {
  minHeight: "12rem",
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  background: "#cbd5e1",
  borderRadius: "0.75rem",
  padding: "1rem",
} as const;

export const remoteVideoStyle = {
  width: "100%",
  minHeight: "16rem",
  maxHeight: "32rem",
  objectFit: "cover",
  borderRadius: "0.75rem",
  background: "#020617",
} as const;

export const localVideoStyle = {
  width: "100%",
  maxWidth: "20rem",
  aspectRatio: "4 / 3",
  objectFit: "cover",
  borderRadius: "0.75rem",
  background: "#0f172a",
} as const;

export const callFactsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))",
  gap: "0.75rem",
  margin: 0,
} as const;

export const secondaryControlStyle = {
  borderRadius: "999px",
  padding: "0.75rem 1rem",
  border: "1px solid #94a3b8",
  background: "#f8fafc",
  color: "#0f172a",
} as const;

export const dangerControlStyle = {
  borderRadius: "999px",
  padding: "0.75rem 1rem",
  border: "1px solid #ef4444",
  background: "#ef4444",
  color: "#fff",
} as const;

export const mutedParagraphStyle = {
  color: "#64748b",
  margin: 0,
} as const;

export const metaTextStyle = {
  color: "#334155",
  margin: 0,
} as const;

export function callStatusBadgeStyle(callStatus: "idle" | "requesting_token" | "connecting" | "connected") {
  return {
    borderRadius: "999px",
    padding: "0.5rem 0.75rem",
    background:
      callStatus === "connected"
        ? "#dcfce7"
        : callStatus === "idle"
          ? "#e2e8f0"
          : "#fef3c7",
    color:
      callStatus === "connected"
        ? "#166534"
        : callStatus === "idle"
          ? "#334155"
          : "#92400e",
    fontWeight: 600,
    textTransform: "capitalize" as const,
  };
}

export function networkBadgeStyle(networkHealth: NetworkHealth) {
  return {
    borderRadius: "999px",
    padding: "0.5rem 0.75rem",
    background:
      networkHealth === "good"
        ? "#dcfce7"
        : networkHealth === "fair"
          ? "#fef3c7"
          : networkHealth === "poor"
            ? "#fee2e2"
            : networkHealth === "offline"
              ? "#e2e8f0"
              : "#dbeafe",
    color:
      networkHealth === "good"
        ? "#166534"
        : networkHealth === "fair"
          ? "#92400e"
          : networkHealth === "poor"
            ? "#b91c1c"
            : networkHealth === "offline"
              ? "#334155"
              : "#1d4ed8",
    fontWeight: 600,
  };
}
