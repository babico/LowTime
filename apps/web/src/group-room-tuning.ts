/**
 * Group-room SFU subscription tuning (Issue #30).
 *
 * For rooms with more than two participants we still want a usable
 * call, but every additional tile multiplies the bandwidth cost on
 * the SFU. The two cheapest levers we control from the web client
 * are:
 *
 *   1. Lower the local publish bitrate so the SFU has less to
 *      forward to every other participant.
 *   2. Keep the receive-side `receiveVideo` flag as the user chose
 *      it (do not flip it from this helper — the join-time
 *      `advancedPrefs.receiveVideo` and the call-page Pause Video
 *      control still own that decision).
 *
 * `adaptiveStream` and `dynacast` are already on in
 * `connectToSfu`, which is what the rest of the savings depend on;
 * this helper just shapes the publish side for groups.
 */

export interface EffectivePublishOptionsForTuning {
  resolution: { width: number; height: number; frameRate: number };
  maxBitrateKbps: number;
  audioOnly: boolean;
  audioPriority: boolean;
  receiveVideo: boolean;
}

export interface ApplyGroupRoomTuningInput {
  options: EffectivePublishOptionsForTuning;
  isGroupRoom: boolean;
}

const GROUP_BITRATE_MULTIPLIER = 0.6;
const MIN_GROUP_BITRATE_KBPS = 80;

export function isGroupRoom(maxParticipants: number | undefined | null): boolean {
  if (typeof maxParticipants !== "number" || !Number.isFinite(maxParticipants)) {
    return false;
  }
  return maxParticipants > 2;
}

export function applyGroupRoomTuning(
  input: ApplyGroupRoomTuningInput,
): EffectivePublishOptionsForTuning {
  if (!input.isGroupRoom) {
    return input.options;
  }

  if (!Number.isFinite(input.options.maxBitrateKbps) || input.options.maxBitrateKbps < 0) {
    throw new Error(
      `applyGroupRoomTuning: maxBitrateKbps must be a non-negative finite number, got ${input.options.maxBitrateKbps}`,
    );
  }

  const nextBitrate = Math.max(
    MIN_GROUP_BITRATE_KBPS,
    Math.round(input.options.maxBitrateKbps * GROUP_BITRATE_MULTIPLIER),
  );

  return {
    ...input.options,
    maxBitrateKbps: nextBitrate,
  };
}
