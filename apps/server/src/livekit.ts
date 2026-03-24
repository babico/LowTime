import { AccessToken } from "livekit-server-sdk";

import type { SfuTokenResponse } from "@lowtime/shared";

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export interface IssueSfuTokenInput {
  roomName: string;
  participantIdentity: string;
  participantName: string;
}

export function getLiveKitConfig(env: NodeJS.ProcessEnv = process.env): LiveKitConfig | null {
  const url = env.LIVEKIT_URL?.trim();
  const apiKey = env.LIVEKIT_API_KEY?.trim();
  const apiSecret = env.LIVEKIT_API_SECRET?.trim();

  if (url == null || url === "" || apiKey == null || apiKey === "" || apiSecret == null || apiSecret === "") {
    return null;
  }

  return {
    url,
    apiKey,
    apiSecret,
  };
}

export async function issueSfuToken(
  config: LiveKitConfig,
  input: IssueSfuTokenInput,
): Promise<SfuTokenResponse> {
  const accessToken = new AccessToken(config.apiKey, config.apiSecret, {
    identity: input.participantIdentity,
    name: input.participantName,
    ttl: "10m",
  });

  accessToken.addGrant({
    roomJoin: true,
    room: input.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return {
    transport: "sfu",
    sfuUrl: config.url,
    token: await accessToken.toJwt(),
    roomName: input.roomName,
    participantIdentity: input.participantIdentity,
    participantName: input.participantName,
  };
}
