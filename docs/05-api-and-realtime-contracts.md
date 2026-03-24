# API And Realtime Contracts

- Purpose: Define the REST endpoints, WebSocket events, authentication rules, and shared type shapes for LowTime.
- Audience: Frontend and backend engineers, QA, and future SDK authors.
- Status: Baseline
- Last Updated: 2026-03-24
- Related Docs: [Room And User Flows](03-room-and-user-flows.md), [Data Model And Lifecycle](06-data-model-and-lifecycle.md), [Backend Architecture](08-backend-architecture.md)

## Overview
The API controls room lifecycle and admission. WebSocket signaling handles live room events, chat, lobby updates, quality changes, and P2P fallback negotiation. Host-only REST requests are authenticated by the `X-LowTime-Host-Secret` header. Public room links never expose this secret.

## REST Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/rooms` | None | Create a room and return join link plus host secret |
| `GET` | `/api/rooms/:slug` | None | Fetch room metadata for the join screen |
| `POST` | `/api/rooms/:slug/join` | None | Validate join request and return admission state |
| `POST` | `/api/rooms/:slug/token` | Session-scoped join data | Issue SFU or P2P join credentials |
| `POST` | `/api/rooms/:slug/settings` | `X-LowTime-Host-Secret` | Change access mode, quality cap, room size, or screen-share policy |
| `POST` | `/api/rooms/:slug/lobby/:requestId/approve` | `X-LowTime-Host-Secret` | Approve a waiting guest |
| `POST` | `/api/rooms/:slug/lobby/:requestId/deny` | `X-LowTime-Host-Secret` | Deny a waiting guest |
| `POST` | `/api/rooms/:slug/reclaim` | `X-LowTime-Host-Secret` | Restore host role after refresh or reconnect |

## Key Request And Response Shapes

### `POST /api/rooms`
Request body:
```json
{
  "accessMode": "open",
  "maxParticipants": 2,
  "qualityCap": "balanced",
  "allowScreenShare": true
}
```

Response body:
```json
{
  "roomSlug": "7Qn2kP9Zx4Lm",
  "joinUrl": "/r/7Qn2kP9Zx4Lm",
  "hostSecret": "base64url-secret",
  "expiresAt": "2026-03-24T18:00:00Z",
  "room": {
    "accessMode": "open",
    "maxParticipants": 2,
    "qualityCap": "balanced",
    "allowScreenShare": true
  }
}
```

### `POST /api/rooms/:slug/join`
Request body:
```json
{
  "displayName": "Sam",
  "passcode": "1234",
  "qualityPreset": "balanced",
  "requestedMedia": {
    "audio": true,
    "video": true
  }
}
```

Response variants:
```json
{
  "joinState": "direct",
  "sessionId": "sess_123",
  "transportPreference": "sfu"
}
```

```json
{
  "joinState": "waiting",
  "requestId": "req_123"
}
```

```json
{
  "joinState": "denied",
  "reason": "room_full"
}
```

### `POST /api/rooms/:slug/token`
Request body:
```json
{
  "sessionId": "sess_123",
  "transportPreference": "sfu"
}
```

Response variants:
```json
{
  "transport": "sfu",
  "sfuUrl": "wss://media.lowtime.example",
  "token": "signed-token"
}
```

```json
{
  "transport": "p2p",
  "p2pSession": {
    "offerRole": "caller",
    "iceServers": [
      { "urls": ["turn:turn.lowtime.example:3478"], "username": "u", "credential": "c" }
    ]
  }
}
```

## WebSocket Signaling
- Endpoint: `WS /signal`
- Client opens the socket after join admission and before or alongside media transport setup.
- First message must identify the `roomSlug`, `sessionId`, and optional `hostSecret`.

### Client To Server Events

| Event | Payload | Purpose |
| --- | --- | --- |
| `room.connect` | `roomSlug`, `sessionId`, `hostSecret?` | Authenticate live room session |
| `chat.send` | `body` | Send room chat message |
| `quality.update` | `preset`, `advancedPrefs` | Update local quality preferences |
| `media.state` | `audioEnabled`, `videoEnabled`, `audioOnly` | Broadcast local media state |
| `p2p.offer` | SDP payload | P2P fallback negotiation |
| `p2p.answer` | SDP payload | P2P fallback negotiation |
| `p2p.ice` | ICE candidate | P2P fallback negotiation |
| `reconnect.start` | none | Mark reconnect attempt started |
| `reconnect.complete` | none | Mark reconnect resolved |

### Server To Client Events

| Event | Payload | Purpose |
| --- | --- | --- |
| `room.snapshot` | room state and participant list | Initialize live state |
| `participant.joined` | participant summary | Update roster |
| `participant.left` | participant id | Update roster |
| `lobby.requested` | request summary | Notify host of waiting guest |
| `lobby.approved` | request id and session data | Release guest into join path |
| `room.settings_updated` | changed room settings | Sync live controls |
| `chat.received` | chat message | Deliver ephemeral chat |
| `network.poor` | network tier and recommendation | Drive low-network UX |
| `transport.switch_available` | next transport | Offer P2P fallback in 1:1 rooms |
| `room.expired` | none | Force return to expired-room UI |

## Shared Types
- `RoomSummary`
  - `slug`
  - `accessMode`
  - `maxParticipants`
  - `qualityCap`
  - `allowScreenShare`
  - `status`
  - `expiresAt`
- `ParticipantSummary`
  - `id`
  - `displayName`
  - `role`
  - `transport`
  - `connectionState`
  - `qualityPreset`
  - `audioEnabled`
  - `videoEnabled`
- `AdvancedMediaPrefs`
  - `maxResolution`
  - `maxFps`
  - `maxBitrateKbps`
  - `audioPriority`
  - `receiveVideo`
  - `audioOnly`
- `ChatMessage`
  - `id`
  - `senderId`
  - `senderName`
  - `body`
  - `createdAt`

## Edge Cases
- Host updates settings while a guest is mid-join.
- Guest receives approval after reconnecting.
- WebSocket is connected but media token has not been issued yet.

## Failure Modes
- Invalid or missing host secret on a host-only endpoint.
- Reconnect attempts using a stale session ID.
- P2P signaling messages sent for a room that is not in fallback mode.

## Implementation Notes
- Contract changes must be reflected here before implementation merges.
- Shared types should be published from a single TypeScript package consumed by client and server.
- Host secret must never be stored in URLs, query strings, or analytics payloads.
