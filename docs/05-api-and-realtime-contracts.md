# API And Realtime Contracts

- Purpose: Define the REST endpoints, WebSocket events, authentication rules, and shared type shapes for LowTime.
- Audience: Frontend and backend engineers, QA, and future SDK authors.
- Status: Baseline
- Last Updated: 2026-03-25
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
| `POST` | `/api/rooms/:slug/settings` | `x-host-secret` | Change access mode or rotate the passcode |
| `POST` | `/api/rooms/:slug/lobby/:requestId/approve` | `x-host-secret` | Approve a waiting guest |
| `POST` | `/api/rooms/:slug/lobby/:requestId/deny` | `x-host-secret` | Deny a waiting guest |
| `POST` | `/api/rooms/:slug/reclaim` | `x-host-secret` | Restore host role after refresh or reconnect |

## Key Request And Response Shapes

### `POST /api/rooms`
Request body:
```json
{
  "accessMode": "passcode",
  "passcode": "blue-falcon-42",
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
  "passcode": "blue-falcon-42",
  "expiresAt": "2026-03-24T18:00:00Z",
  "room": {
    "slug": "7Qn2kP9Zx4Lm",
    "accessMode": "passcode",
    "maxParticipants": 2,
    "qualityCap": "balanced",
    "allowScreenShare": true,
    "status": "created",
    "expiresAt": "2026-03-24T18:00:00Z"
  }
}
```

Current implementation notes:
- The `passcode` request field is required when `accessMode` is `passcode` and is ignored for any other access mode. Passcodes must be 4 to 64 UTF-8 code points with no control characters and no leading or trailing whitespace.
- The `passcode` response field is only present when the created room uses `accessMode` `passcode`. The plaintext is returned exactly once. The server stores only an Argon2id hash.
- The nested `room` summary never includes the passcode plaintext or hash.

### `GET /api/rooms/:slug`
Response body:
```json
{
  "slug": "7Qn2kP9Zx4Lm",
  "accessMode": "open",
  "maxParticipants": 2,
  "qualityCap": "balanced",
  "allowScreenShare": true,
  "status": "created",
  "expiresAt": "2026-03-24T18:00:00Z"
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

Current implementation notes:
- `open` rooms return `direct` with a generated `sessionId` and `transportPreference` of `sfu`.
- `lobby` rooms return `waiting` with a generated `requestId`.
- `passcode` rooms verify the submitted `passcode` against the stored Argon2id hash. The server returns `{"joinState":"denied","reason":"passcode_required"}` when the body has no passcode, `{"joinState":"denied","reason":"invalid_passcode"}` when the passcode does not match, and the `direct` shape (same as `open` rooms) on a successful verification.
- Repeated failures from the same `(client IP, room slug)` pair are throttled: 5 failed attempts within a 5 minute sliding window open a 60 second cooldown during which all passcode submissions from that pair return `invalid_passcode` without invoking the verifier. Neither the cooldown duration nor its existence is revealed in the response body.
- The precedence of denial reasons is `room_expired` > `room_full` > `passcode_required` > `invalid_passcode`.

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
  "token": "signed-token",
  "roomName": "7Qn2kP9Zx4Lm",
  "participantIdentity": "sess_123",
  "participantName": "Sam"
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

Current implementation notes:
- `sessionId` must belong to an admitted room session before media credentials are issued.
- If the room exists but the session has been reaped by the cleanup tick, the server returns `410 Gone` with `{ "message": "Session expired; rejoin the room" }`. The client should redirect the user to the join flow.
- On a successful token issuance, the server bumps `lastSeenAt` on the session to keep it alive.
- The server currently supports `sfu` token issuance and returns a retryable error when SFU credentials are not configured.
- The web client currently uses the SFU response to enter `/r/:slug/call` and establish the first end-to-end media connection.

## WebSocket Signaling
- Endpoint: `WS /signal`
- Client opens the socket after join admission and before or alongside media transport setup.
- First message must identify the `roomSlug`, `sessionId`, and optional `hostSecret`.

### Currently Implemented
- **Client → server**: `room.connect` with `{ kind: "room.connect", roomSlug, sessionId }` as the first frame. Any other first frame returns `{ kind: "error", code: "bad_connect" }` and closes the socket. Unknown slug or unknown `sessionId` returns `{ kind: "error", code: "unauthorized" }` and closes.
- **Client → server**: `room.ping` with `{ kind: "room.ping" }` sent every 20 seconds while connected. The server bumps `lastSeenAt` on the session and replies with `{ kind: "room.pong", serverTime: <ISO-8601> }`. If the session has already been reaped, the server replies with `{ kind: "error", code: "session_expired", message: "Session expired; rejoin the room" }` and closes the socket.
- **Client → server**: `chat.send` with `{ kind: "chat.send", body: string }` to send a chat message. The body must be 1–500 characters. The server broadcasts `{ kind: "chat.received", message: ChatMessage }` to all connected sessions in the room via the signal bus.
- **Server → client**: on a successful connect, the server immediately sends `{ kind: "room.snapshot", room: RoomSummary }`. While connected, every accepted `POST /api/rooms/:slug/settings` call fans out `{ kind: "room.settings_updated", room: RoomSummary }` to every subscribed socket on that slug.
- **Server → client** `room.pong`: `{ kind: "room.pong", serverTime: <ISO-8601> }` in response to a `room.ping`. Clients treat this as a keep-alive acknowledgement and do not surface it to consumers.
- **Server → client** `chat.received`: `{ kind: "chat.received", message: ChatMessage }` broadcast to all connected sessions when any participant sends a `chat.send`. Chat is ephemeral — messages are not persisted and are lost when the room is reaped.
- **Server → client** error shape: `{ kind: "error", code, message }`. Known codes: `bad_message`, `bad_connect`, `unauthorized`, `unsupported_message`, `session_expired`, `invalid_message`.

### Deferred
The event tables below enumerate the full planned signaling surface. Everything except `room.connect`, `room.snapshot`, `room.settings_updated`, and the `error` frame is still planned.

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
| `participant_removed` | session id and reason | Inform every socket the host removed a session |

## Shared Types
- `RoomSummary`
  - `slug`
  - `accessMode`
  - `maxParticipants`
  - `qualityCap`
  - `allowScreenShare`
  - `status`
  - `expiresAt`
  - `participants?: RoomParticipant[]` (id + displayName per admitted session)
- `RoomParticipant`
  - `id`
  - `displayName`
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
- Current implementation now includes:
  - `GET /api/rooms/:slug/lobby` for host-visible pending requests using `x-host-secret`
  - `GET /api/rooms/:slug/lobby/:requestId` for guest waiting-room polling
  - `POST /api/rooms/:slug/lobby/:requestId/approve` for host admission
  - `POST /api/rooms/:slug/lobby/:requestId/deny` for host denial
  - `POST /api/rooms/:slug/settings` for host-only access mode and passcode rotation
  - `POST /api/rooms/:slug/reclaim` for host reclaim after refresh
- HTTP header names are case-insensitive per RFC 7230. All host-only endpoints use the lowercase `x-host-secret` form in the table; clients may send any casing.

### `POST /api/rooms/:slug/reclaim`
Host-only via the `x-host-secret` header.

Request body: none required.

Response body (200):
```json
{
  "room": {
    "slug": "7Qn2kP9Zx4Lm",
    "accessMode": "lobby",
    "maxParticipants": 2,
    "qualityCap": "balanced",
    "allowScreenShare": true,
    "status": "active",
    "expiresAt": "2026-03-24T18:00:00Z"
  },
  "lobbyRequests": [
    { "requestId": "req_abc", "displayName": "Guest A", "createdAt": "2026-03-24T16:50:00Z" }
  ]
}
```

Failure responses:
- `403` with `{ "message": "Host secret is required" }` for a missing header, a wrong header, or an unknown room slug. The endpoint deliberately returns the same shape for all four cases to prevent enumeration.
- `409` with `{ "message": "Room is no longer available" }` when the host secret is valid but the room has expired or closed.

Current implementation notes:
- `lobbyRequests` is always present. It carries the current pending-approval queue for a room whose `accessMode` is `lobby` and is an empty array otherwise.
- The response body never includes the plaintext host secret, the plaintext passcode, or the passcode hash.
- Reclaim is idempotent. It does not mutate `status`, `expiresAt`, `accessMode`, the passcode hash, sessions, the lobby queue, or the passcode rate limiter.
- Repeated failures from the same `(client IP, room slug)` pair are rate-limited under the same profile as passcode verification: 5 failed attempts within a 5 minute sliding window open a 60 second cooldown during which reclaim attempts from that pair return `403` without invoking the host-secret check. Successful attempts reset the counter. Unknown-slug attempts never touch the limiter.
- A future WebSocket `room.connect` path (carrying the host secret as a payload field) is documented in the WebSocket Signaling section below and will be revisited when signaling lands.

### `POST /api/rooms/:slug/settings`
Host-only via the `x-host-secret` header. The request body must change at least one of `accessMode` or `passcode`.

Request body variants:
```json
{ "accessMode": "passcode", "passcode": "new-secret-9" }
```

```json
{ "accessMode": "open" }
```

```json
{ "passcode": "rotated-secret" }
```

```json
{ "qualityCap": "low" }
```

Response body:
```json
{
  "room": {
    "slug": "7Qn2kP9Zx4Lm",
    "accessMode": "passcode",
    "maxParticipants": 2,
    "qualityCap": "balanced",
    "allowScreenShare": true,
    "status": "created",
    "expiresAt": "2026-03-24T18:00:00Z"
  }
}
```

Current implementation notes:
- The settings response never echoes the new plaintext passcode. The host is expected to remember the value they just sent.
- Transitioning to `accessMode = "passcode"` requires a non-empty `passcode` body that passes the same validation used at creation.
- Transitioning away from `accessMode = "passcode"` clears the stored hash and ignores any submitted `passcode`.
- A body with only `passcode` (no `accessMode`) is treated as a rotation and requires the room to already be in passcode mode.
- A body with only `qualityCap` is accepted as a live room-cap change; values are restricted to `"low" | "balanced" | "high"`.
- Every accepted settings call clears the per-room rate limiter so a freshly-rotated passcode is not locked out by residual cooldown state.
