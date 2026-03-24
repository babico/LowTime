# ADR-002: SFU First With 1:1 P2P Fallback

- Purpose: Record why LowTime uses an SFU as the default media path and limits P2P to 1:1 fallback.
- Audience: Media, backend, and frontend contributors.
- Status: Accepted
- Last Updated: 2026-03-24
- Related Docs: [System Architecture](../02-system-architecture.md), [Media And Quality](../04-media-and-quality.md)

## Context
LowTime must support low-bandwidth conditions, host-controlled room policy, and eventual growth from 1:1 to small-group rooms. Pure P2P is simple for 1:1, but it becomes difficult to control and scale for group rooms. Pure SFU is more operationally complex but gives stronger control and observability.

## Decision
Use LiveKit SFU as the default transport for all rooms. If SFU connection setup fails in a 1:1 room after retry, offer a direct WebRTC P2P fallback. Do not support P2P mesh for rooms larger than 2 participants.

## Consequences
- Group rooms can be supported without reworking the core media model.
- Media quality and observability are easier to manage centrally.
- The system still has a resilience path for 1:1 rooms if SFU setup fails.
- Backend and operational complexity are higher than a P2P-only MVP.

## Alternatives Considered
- P2P only
  - Rejected because it does not scale cleanly to even small groups and weak-network tuning is harder.
- SFU only with no fallback
  - Rejected because 1:1 calls benefit from a recovery path when SFU setup fails.
