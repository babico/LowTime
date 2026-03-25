export type NetworkHealth = "offline" | "reconnecting" | "poor" | "fair" | "good";

export interface NetworkAssessmentInput {
  callStatus: "idle" | "requesting_token" | "connecting" | "connected";
  isOnline: boolean;
  effectiveType?: string;
  rtt?: number;
}

export function assessNetworkHealth(input: NetworkAssessmentInput): NetworkHealth {
  if (!input.isOnline) {
    return "offline";
  }

  if (input.callStatus !== "connected") {
    return "reconnecting";
  }

  const effectiveType = input.effectiveType?.toLowerCase();
  const rtt = input.rtt;

  if (effectiveType === "slow-2g" || effectiveType === "2g" || (rtt != null && rtt >= 600)) {
    return "poor";
  }

  if (effectiveType === "3g" || (rtt != null && rtt >= 250)) {
    return "fair";
  }

  return "good";
}

export function getNetworkHealthLabel(networkHealth: NetworkHealth): string {
  switch (networkHealth) {
    case "offline":
      return "Offline";
    case "reconnecting":
      return "Reconnecting";
    case "poor":
      return "Poor network";
    case "fair":
      return "Fair network";
    case "good":
      return "Good network";
    default:
      return "Network unknown";
  }
}
