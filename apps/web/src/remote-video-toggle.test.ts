import assert from "node:assert/strict";
import test from "node:test";

import { setRemoteVideoSubscription, type RemoteVideoRoomLike } from "./remote-video-toggle.js";

interface FakeTrackPublication {
  trackSid: string;
  kind: "video" | "audio";
  calls: Array<{ sid: string; subscribed: boolean }>;
}

function makeRoom(opts: {
  videoSids?: string[];
  audioSids?: string[];
  withSetSubscribed?: boolean;
}): {
  room: RemoteVideoRoomLike;
  videoCalls: Array<{ sid: string; subscribed: boolean }>;
  audioCalls: Array<{ sid: string; subscribed: boolean }>;
} {
  const videoCalls: Array<{ sid: string; subscribed: boolean }> = [];
  const audioCalls: Array<{ sid: string; subscribed: boolean }> = [];

  const publications: FakeTrackPublication[] = [
    ...(opts.videoSids ?? []).map<FakeTrackPublication>((sid) => ({
      trackSid: sid,
      kind: "video",
      calls: videoCalls,
    })),
    ...(opts.audioSids ?? []).map<FakeTrackPublication>((sid) => ({
      trackSid: sid,
      kind: "audio",
      calls: audioCalls,
    })),
  ];

  const room: RemoteVideoRoomLike = {
    localParticipant: {
      setSubscribed: opts.withSetSubscribed === false
        ? undefined
        : async (sid: string, subscribed: boolean) => {
            const pub = publications.find((p) => p.trackSid === sid);
            if (pub != null) {
              pub.calls.push({ sid, subscribed });
            }
          },
    },
    remoteParticipants: new Map<string, { trackPublications: Map<string, FakeTrackPublication> }>([
      [
        "p1",
        {
          trackPublications: new Map(publications.map((p) => [p.trackSid, p])),
        },
      ],
    ]),
  };

  return { room, videoCalls, audioCalls };
}

test("setRemoteVideoSubscription unsubscribes every remote video track when paused", async () => {
  const { room, videoCalls, audioCalls } = makeRoom({
    videoSids: ["V_1", "V_2"],
    audioSids: ["A_1"],
  });

  const result = await setRemoteVideoSubscription({ room, subscribed: false });

  assert.equal(result.ok, true);
  assert.equal(result.changedTracks, 2);
  assert.deepEqual(videoCalls, [
    { sid: "V_1", subscribed: false },
    { sid: "V_2", subscribed: false },
  ]);
  assert.equal(audioCalls.length, 0);
});

test("setRemoteVideoSubscription resubscribes remote video when requested", async () => {
  const { room, videoCalls } = makeRoom({ videoSids: ["V_1"] });

  await setRemoteVideoSubscription({ room: room as unknown as RemoteVideoRoomLike, subscribed: false });
  await setRemoteVideoSubscription({ room: room as unknown as RemoteVideoRoomLike, subscribed: true });

  assert.deepEqual(videoCalls, [
    { sid: "V_1", subscribed: false },
    { sid: "V_1", subscribed: true },
  ]);
});

test("setRemoteVideoSubscription returns ok with zero changes when there are no remote videos", async () => {
  const { room, videoCalls } = makeRoom({ audioSids: ["A_1"] });

  await setRemoteVideoSubscription({ room: room as unknown as RemoteVideoRoomLike, subscribed: false });
  assert.equal(videoCalls.length, 0);
});

test("setRemoteVideoSubscription returns an error when the room has no setSubscribed API", async () => {
  const { room } = makeRoom({ videoSids: ["V_1"], withSetSubscribed: false });

  const result = await setRemoteVideoSubscription({ room: room as unknown as RemoteVideoRoomLike, subscribed: false });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /does not support/i);
  }
});

test("setRemoteVideoSubscription returns an error when room is null", async () => {
  const result = await setRemoteVideoSubscription({ room: null, subscribed: false });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /not connected/i);
  }
});

test("setRemoteVideoSubscription surfaces underlying setSubscribed failure", async () => {
  const videoCalls: Array<{ sid: string; subscribed: boolean }> = [];
  const room = {
    localParticipant: {
      setSubscribed: async (sid: string, subscribed: boolean) => {
        videoCalls.push({ sid, subscribed });
        throw new Error("signaling offline");
      },
    },
    remoteParticipants: new Map([
      [
        "p1",
        {
          trackPublications: new Map([
            ["V_1", { trackSid: "V_1", kind: "video" }],
          ]),
        },
      ],
    ]),
  };

  const captured: string[] = [];
  const result = await setRemoteVideoSubscription({
    room: room as unknown as RemoteVideoRoomLike,
    subscribed: false,
    onError: (message) => captured.push(message),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(captured, ["signaling offline"]);
  assert.equal(videoCalls.length, 1);
});

test("setRemoteVideoSubscription counts a partial failure as zero changed tracks", async () => {
  const room = {
    localParticipant: {
      setSubscribed: async (sid: string) => {
        if (sid === "V_2") {
          throw new Error("V_2 failed");
        }
      },
    },
    remoteParticipants: new Map([
      [
        "p1",
        {
          trackPublications: new Map([
            ["V_1", { trackSid: "V_1", kind: "video" }],
            ["V_2", { trackSid: "V_2", kind: "video" }],
          ]),
        },
      ],
    ]),
  };

  const result = await setRemoteVideoSubscription({ room: room as unknown as RemoteVideoRoomLike, subscribed: false });

  assert.equal(result.ok, false);
  assert.equal(result.changedTracks, 1);
});
