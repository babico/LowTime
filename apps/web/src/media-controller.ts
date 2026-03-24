import { Room } from "livekit-client";

import type { RequestedMedia, SfuTokenResponse } from "@lowtime/shared";

export interface ConnectToSfuInput {
  credentials: SfuTokenResponse;
  requestedMedia: RequestedMedia;
}

export async function connectToSfu(input: ConnectToSfuInput): Promise<Room> {
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
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
