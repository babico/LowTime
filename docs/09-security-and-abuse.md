# Security And Abuse

- Purpose: Define how LowTime protects host privileges, room access, privacy, and abuse surfaces in a registration-free system.
- Audience: Backend, platform, and security-minded contributors.
- Status: Baseline
- Last Updated: 2026-03-24
- Related Docs: [System Architecture](02-system-architecture.md), [API And Realtime Contracts](05-api-and-realtime-contracts.md), [Data Model And Lifecycle](06-data-model-and-lifecycle.md), [ADR-001](adr/ADR-001-no-registration.md)

## Overview
LowTime avoids account-based security controls, so link entropy, host-secret handling, rate limiting, and privacy minimization become more important. The security posture should be lightweight but deliberate: keep secrets out of URLs, hash sensitive values at rest, and limit what is stored durably.

## Host Secret Model
- Generate a host secret from at least 32 random bytes encoded as base64url.
- Return the host secret only once on room creation.
- Store only a strong hash of the host secret in PostgreSQL.
- Send the host secret in the `X-LowTime-Host-Secret` header for host-only REST actions.
- Allow the WebSocket `room.connect` event to include the host secret so the server can restore host role live.

## Passcode Handling
- Store passcodes only as Argon2id hashes.
- Compare passcodes on join before issuing media tokens.
- Rate-limit repeated failures by IP and room slug.
- Never echo passcodes back to the client or logs.

## Link And Room ID Policy
- Use 12-character base58 room slugs.
- Treat the room link as public but unguessable.
- Do not embed host or privileged data in the room URL.

## Abuse Controls
- Rate-limit room creation by IP and user agent hint.
- Rate-limit join attempts and passcode failures by IP and room.
- Log repeated denial patterns and suspicious room-create bursts.
- Give hosts the ability to remove participants and switch to lobby or passcode mode live.

## Privacy Constraints
- Do not store account profiles because v1 has no accounts.
- Keep chat ephemeral and tied to the active room only.
- Minimize durable participant data.
- Do not ship analytics events containing room passcodes, host secrets, SDP, or ICE payloads.

## Threat Assumptions
- Public room links may be shared widely or unintentionally.
- Clients may attempt forged host actions.
- Attackers may brute-force passcodes or spam room creation.
- Network metadata still exists at the transport layer even if app-level data retention is low.

## Edge Cases
- Host clears local storage and loses the only copy of the host secret.
- A participant rejoins from a different IP during the reconnect window.
- Analytics tooling accidentally captures sensitive query or header data.

## Failure Modes
- Weak slug entropy leads to room enumeration.
- Missing rate limits cause room-creation abuse.
- Host secret leaks into browser history, logs, or crash reports.

## Implementation Notes
- Review logging middleware carefully so sensitive headers are redacted.
- Default to deny on host-only actions when validation is ambiguous.
- Keep privacy expectations explicit in the user-facing product copy.
