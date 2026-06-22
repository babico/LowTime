# LowTime Implementation Tracker

- Purpose: Track implementation progress feature by feature and provide one living checklist that must be updated whenever work lands.
- Audience: Engineers, reviewers, and release owners.
- Status: Active
- Last Updated: 2026-03-25
- Related Docs: [README](README.md), [Docs Map](docs/00-docs-map.md), [Roadmap And Release Phases](docs/12-roadmap-and-release-phases.md), [Testing And QA](docs/11-testing-and-qa.md)

## How To Use This File
- Update this file in the same pull request as the code change.
- Change a feature to `done` only when implementation, tests, and required docs updates are complete.
- Use `in_progress` when work has started but is not yet shippable.
- Use `blocked` with a short note when external or architectural issues prevent progress.
- If a feature ships with reduced scope, note the gap in the `Notes` column instead of marking it fully done.

## Status Legend
- `planned`: not started
- `in_progress`: actively being built
- `blocked`: cannot move forward yet
- `done`: implemented, tested, and documented

## Current Snapshot

| Area | Feature | Status | Notes | Source |
| --- | --- | --- | --- | --- |
| Documentation | Root docs package | `done` | Baseline docs, diagrams, and ADRs created | [docs/00-docs-map.md](docs/00-docs-map.md) |
| Documentation | Contribution and ADR workflow | `done` | Contributor rules and ADR policy documented | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Tooling | Monorepo scaffolding | `done` | Issue #1. Added root workspace files plus `apps/web`, `apps/server`, and `packages/shared` scaffolds | [docs/12-roadmap-and-release-phases.md](docs/12-roadmap-and-release-phases.md) |
| Tooling | Dockerfiles and Compose baseline | `done` | Issue #2. Added Dockerfiles for web and server, root compose stack, and baseline env contract | [docs/adr/ADR-006-docker-first-deployment.md](docs/adr/ADR-006-docker-first-deployment.md) |
| Tooling | CI and linting baseline | `done` | Issue #3. Added workspace lint, test, typecheck, and build checks plus a GitHub Actions workflow for PR and main-branch validation | [docs/12-roadmap-and-release-phases.md](docs/12-roadmap-and-release-phases.md) |

## Phase 1: Core 1:1 Calling

| Feature | Status | Notes | Source |
| --- | --- | --- | --- |
| Room creation endpoint and share link | `done` | Issue #4. Added room creation, host secret issuance, room metadata lookup, and a web share-link flow | [docs/05-api-and-realtime-contracts.md](docs/05-api-and-realtime-contracts.md) |
| Public join flow with display name | `done` | Issue #5. Added open-room admission, lobby waiting responses, and a no-registration join form on the room page | [docs/03-room-and-user-flows.md](docs/03-room-and-user-flows.md) |
| Join screen with device preview | `done` | Issue #6. Added join-side camera/mic preview, media toggles, and quality preset selection before room admission | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| SFU integration for 1:1 rooms | `done` | Issue #7. Added LiveKit token issuance, a minimal `/r/:slug/call` handoff, and a web SFU connection flow for direct joins | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Basic in-call UI | `done` | Issue #8. Added a usable call screen with remote tile area, local self-view, and mute/camera/leave controls on the LiveKit path | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Network health badge | `done` | Issue #9. Added a call-header badge that reflects offline, reconnecting, poor, fair, and good network states from browser connectivity heuristics | [docs/10-observability-and-operations.md](docs/10-observability-and-operations.md) |
| PWA shell and installability | `done` | Issue #10. Added a manifest, shell caching service worker, app icons, and a landing-page install prompt | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |

## Phase 2: Admission Control And Recovery

| Feature | Status | Notes | Source |
| --- | --- | --- | --- |
| Lobby mode | `done` | Issue #11. Added pending lobby requests, host approval and denial endpoints, a waiting route, and host-side queue controls in the room screen | [docs/03-room-and-user-flows.md](docs/03-room-and-user-flows.md) |
| Passcode-protected rooms | `done` | Issue #12. Added Argon2id hash storage, join-time verification, `(IP, slug)` rate limiter, host-only settings endpoint for rotation, and access-mode + passcode UI on create and join screens | [docs/09-security-and-abuse.md](docs/09-security-and-abuse.md) |
| Host reclaim after refresh | `done` | Issue #13. Added `POST /api/rooms/:slug/reclaim` with dedicated `(IP, slug)` rate limiter, `useHostReclaim` hook that silently validates cached host secrets on room-page mount, and a paste-a-secret form for hosts without a cached credential | [docs/03-room-and-user-flows.md](docs/03-room-and-user-flows.md) |
| Reconnect window and session recovery | `done` | Issue #14. Added `lastSeenAt` on `StoredSession`, `touchSession`/`deleteSession` store methods, session reaper in `runCleanupTick` with 5-minute `RECONNECT_WINDOW_MS`, 410 on reaped sessions at the token endpoint, `room.ping`/`room.pong` WebSocket heartbeat (20s interval), and `sessionExpired` flag in `useRoomSignaling` | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |
| Room expiry and cleanup jobs | `done` | Issue #15. Added activity-driven room expiry with a 2h inactivity timer, a 60-second cleanup loop, 10-minute lobby-request TTL with new `lobby_timeout` denial reason, and a 5-minute closed-room grace window. See `apps/server/src/domain/room-cleanup.ts` and `apps/server/src/domain/room-activity.ts` | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |

## Phase 3: Flexible Quality Controls

| Feature | Status | Notes | Source |
| --- | --- | --- | --- |
| Quality presets | `done` | Issue #16. Shared `apps/web/src/quality-presets.ts` table drives both the device-preview constraints and the LiveKit publish options for Data Saver / Balanced / Best Quality | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Advanced media controls | `done` | Issue #17. Added a shared `AdvancedMediaPrefs` shape with six overrides (maxResolution, maxFps, maxBitrateKbps, audioPriority, receiveVideo, audioOnly), pure `computeEffectivePublishOptions` helper, Advanced Media Controls disclosure on the room page, and `StoredCallSession` round-trip of the user prefs | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Host quality cap | `done` | Issue #18. Shared `clampPresetToCap` helper in `packages/shared/src/index.ts` drives both the client preset dropdown and the server `POST /api/rooms/:slug/settings` handler; room-page now hides presets above the cap and the settings handler accepts a `qualityCap` body field | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Live room settings updates | `done` | Issue #19. Added the first piece of the signaling backbone: `WS /signal` route, in-memory `SignalBus` domain module, and `room.settings_updated` broadcasts from `POST /api/rooms/:slug/settings`. Web client's `useRoomSignaling` hook receives the updated `RoomSummary` on the call page so access-mode and quality-cap changes propagate live | [docs/05-api-and-realtime-contracts.md](docs/05-api-and-realtime-contracts.md) |
| Automatic low-network downgrade | `done` | Issue #20. Added a pure `computeDowngradeStep` state machine and a `useAutoDowngrade` hook that walks the bitrate → resolution → frame rate → video-paused ladder with 10s dwell hysteresis. Call page renders a "Quality reduced" chip with a Restore Video button | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Audio-only prompt flow | `done` | Issue #21. After 30 seconds at the `video-paused` downgrade rung, the call page shows a non-blocking dialog offering "Continue audio-only" or "Keep trying video". Accepting pins `advancedPrefs.audioOnly` to true on the stored session | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| 1:1 P2P fallback after SFU failure | `done` | Issue #22. Added `issueP2PToken` helper with deterministic caller/callee role assignment, P2P branch in the token endpoint, socket registry in the signal route for direct relay of `p2p.offer`/`p2p.answer`/`p2p.ice`, `transport.switch_available` event when both sessions connect to a 1:1 room, `useP2PFallback` hook managing `RTCPeerConnection` lifecycle, and "Switching to direct connection" indicator on the call page | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |

## Phase 4: Collaboration Features

| Feature | Status | Notes | Source |
| --- | --- | --- | --- |
| Lightweight in-room chat | `done` | Issue #23. Added ephemeral `chat.send`/`chat.received` signaling, `ChatPanel` component on the call page, `chatMessages` state in `useRoomSignaling`, and `ChatMessage` type in shared package | [docs/05-api-and-realtime-contracts.md](docs/05-api-and-realtime-contracts.md) |
| Desktop screen share | `planned` | Hide on unsupported browsers | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Device switching | `planned` | Front/back camera and mic/speaker selection where supported | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Pause incoming video control | `planned` | User-level bandwidth control | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Host remove participant | `planned` | Basic moderation control | [docs/03-room-and-user-flows.md](docs/03-room-and-user-flows.md) |

## Phase 5: Small-Group Beta

| Feature | Status | Notes | Source |
| --- | --- | --- | --- |
| Raise room size to 4 participants | `planned` | Beta label remains until metrics are healthy | [docs/12-roadmap-and-release-phases.md](docs/12-roadmap-and-release-phases.md) |
| Group participant layout | `planned` | Responsive layout beyond 1:1 | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| SFU subscription tuning for groups | `planned` | Prioritize visible tiles and lower background cost | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Group beta validation metrics | `planned` | Use KPI thresholds before broad rollout | [docs/10-observability-and-operations.md](docs/10-observability-and-operations.md) |

## Cross-Cutting Infrastructure

| Feature | Status | Notes | Source |
| --- | --- | --- | --- |
| PostgreSQL room metadata | `in_progress` | Durable room state and audit events. Slice 1 (client + migration) shipped in PR #106; slice 2 (room store) in progress. | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |
| Redis live room state | `planned` | Presence, lobby, reconnect, rate limits, chat buffer | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |
| coturn integration | `planned` | NAT traversal and relay support | [docs/02-system-architecture.md](docs/02-system-architecture.md) |
| Docker-based deployment packaging | `done` | Compose now defines web, server, postgres, redis, coturn, and optional LiveKit services | [docs/02-system-architecture.md](docs/02-system-architecture.md) |
| Metrics, logs, and dashboards | `planned` | Product, media, and abuse visibility | [docs/10-observability-and-operations.md](docs/10-observability-and-operations.md) |
| Abuse and rate-limit controls | `planned` | Protect room creation and join paths | [docs/09-security-and-abuse.md](docs/09-security-and-abuse.md) |

## Refactor Program

| Feature | Status | Notes | Source |
| --- | --- | --- | --- |
| Web route-level page extraction | `done` | Issue #52. Extracted route-level pages and reduced `App.tsx` size materially | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Web styles extraction from `App.tsx` | `planned` | Issue #53. Shared page styles already moved once; deeper style-module cleanup is still open | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Room and waiting feature-module split | `done` | Issue #54. Room and waiting effects/actions live in feature modules | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Call feature-module split | `done` | Issue #55. Call connection and media sync moved into `features/call/call-effects.ts` | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Preview and install feature-module split | `done` | Issue #56. Install and preview behavior moved into dedicated feature hooks | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Web route helpers and app shell | `done` | Issue #57. Added `app/routes.ts` and `app/app-shell.tsx` | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Server route registration split | `done` | Issue #58. Fastify route modules now own health, rooms, lobby, and media endpoints | [docs/08-backend-architecture.md](docs/08-backend-architecture.md) |
| Server room validation and status domain split | `done` | Issue #59. Validation and room status logic now live in domain modules | [docs/08-backend-architecture.md](docs/08-backend-architecture.md) |
| Server room-store domain split | `done` | Issue #60. In-memory store and lobby/session mutations moved into `domain/room-store.ts` | [docs/08-backend-architecture.md](docs/08-backend-architecture.md) |
| Server integration test split | `done` | Issue #61. Split route coverage into `rooms`, `lobby`, and `media` test files | [docs/08-backend-architecture.md](docs/08-backend-architecture.md) |
| Architecture docs for refactored structure | `done` | Issue #62. Updated frontend/backend architecture docs and contributor guidance to match the shipped layout | [docs/08-backend-architecture.md](docs/08-backend-architecture.md) |

## Update Rule For Every PR
- If a feature changes status, update this file.
- If a feature is done, verify the matching source doc still describes the shipped behavior.
- If a feature is split into smaller deliverables, add rows here instead of hiding partial completion in commit messages.
