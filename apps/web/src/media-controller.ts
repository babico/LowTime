import { Room, VideoPresets, type VideoEncoding, type VideoResolution } from "livekit-client";

import type { QualityPreset, RequestedMedia, SfuTokenResponse } from "@lowtime/shared";

import { getPresetProfile } from "./quality-presets.js";

export interface ConnectToSfuInput {
  credentials: SfuTokenResponse;
  requestedMedia: RequestedMedia;
  qualityPreset?: QualityPreset;
}

/**
 * Turns a quality preset into the LiveKit publish options the Room should use
 * for the local video track. Callers without a preset get Balanced, matching
 * the pre-existing behavior.
 */
function buildLiveKitOptions(qualityPreset: QualityPreset | undefined): {
  videoCaptureDefaults: { resolution: VideoResolution };
  publishDefaults: { videoEncoding: VideoEncoding };
} {
  const profile = getPresetProfile(qualityPreset ?? "balanced");
  const resolution: VideoResolution = {
    width: profile.maxResolution.width,
    height: profile.maxResolution.height,
    frameRate: profile.maxFps,
    // Reference an existing preset to let LiveKit pick a reasonable
    // base encoding while our bitrate cap applies on top.
    ...VideoPresets.h360.encoding,
  };

  return {
    videoCaptureDefaults: { resolution },
    publishDefaults: {
      videoEncoding: {
        maxBitrate: profile.maxVideoBitrateKbps * 1000,
        maxFramerate: profile.maxFps,
      },
    },
  };
}

export async function connectToSfu(input: ConnectToSfuInput): Promise<Room> {
  const liveKitOptions = buildLiveKitOptions(input.qualityPreset);

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    ...liveKitOptions,
  });

  try {
    await room.connect(input.credentials.sfuUrl, input.credentials.token, {
      autoSubscribe: true,
    });

    if (input.requestedMedia.audio) {
      await room.localParticipant.setMicrophoneEnabled(true);
    }

    if (input.requestedMedia.video) {
      await room.localParticipant.setCameraEnabled(true);
    }

    return room;
  } catch (error) {
    room.disconnect();
    throw error;
  }
}
