import { Room, VideoPresets, type VideoEncoding, type VideoResolution } from "livekit-client";

import type {
  AdvancedMediaPrefs,
  QualityCap,
  QualityPreset,
  RequestedMedia,
  SfuTokenResponse,
} from "@lowtime/shared";

import { applyGroupRoomTuning } from "./group-room-tuning.js";
import {
  computeEffectivePublishOptions,
  type EffectivePublishOptions,
} from "./quality-presets.js";

export interface ConnectToSfuInput {
  credentials: SfuTokenResponse;
  requestedMedia: RequestedMedia;
  qualityPreset?: QualityPreset;
  qualityCap?: QualityCap;
  advancedPrefs?: AdvancedMediaPrefs;
  /**
   * Number of admitted participants the room allows. When greater than
   * two, `connectToSfu` lowers the local publish bitrate so the SFU
   * does not pay full per-tile cost on every other participant.
   * See Issue #30.
   */
  maxParticipants?: number;
}

/**
 * Turns the preset / cap / advanced-prefs triple into the LiveKit publish
 * options the Room uses for its local video track. Callers without any of
 * the optional fields get the legacy Balanced defaults.
 */
function buildLiveKitOptions(
  effective: EffectivePublishOptions,
): {
  videoCaptureDefaults: { resolution: VideoResolution };
  publishDefaults: { videoEncoding: VideoEncoding; dtx: boolean };
} {
  const resolution: VideoResolution = {
    width: effective.resolution.width,
    height: effective.resolution.height,
    frameRate: effective.resolution.frameRate,
    ...VideoPresets.h360.encoding,
  };

  return {
    videoCaptureDefaults: { resolution },
    publishDefaults: {
      videoEncoding: {
        maxBitrate: effective.maxBitrateKbps * 1000,
        maxFramerate: effective.resolution.frameRate,
      },
      // `dtx = true` lets WebRTC stop sending audio during silence, which
      // keeps more bandwidth available for video. Flipped on when the user
      // opts into audio priority.
      dtx: effective.audioPriority,
    },
  };
}

export async function connectToSfu(input: ConnectToSfuInput): Promise<Room> {
  const computed = computeEffectivePublishOptions({
    preset: input.qualityPreset ?? "balanced",
    cap: input.qualityCap ?? "high",
    advanced: input.advancedPrefs,
  });
  const isGroup = typeof input.maxParticipants === "number" && input.maxParticipants > 2;
  const effective = applyGroupRoomTuning({
    options: computed,
    isGroupRoom: isGroup,
  });
  const liveKitOptions = buildLiveKitOptions(effective);

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    ...liveKitOptions,
  });

  try {
    // When the user asked to receive no remote video, we still connect with
    // `autoSubscribe: true` but filter out video tracks via the room option
    // below. Pure audio-only rooms keep the default.
    await room.connect(input.credentials.sfuUrl, input.credentials.token, {
      autoSubscribe: effective.receiveVideo,
    });

    if (input.requestedMedia.audio) {
      await room.localParticipant.setMicrophoneEnabled(true);
    }

    // Honor audioOnly: do NOT publish camera even when requestedMedia.video
    // is true. The user can still flip camera on later via the call UI.
    if (input.requestedMedia.video && !effective.audioOnly) {
      await room.localParticipant.setCameraEnabled(true);
    }

    return room;
  } catch (error) {
    room.disconnect();
    throw error;
  }
}
