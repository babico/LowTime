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
| Desktop screen share | `done` | Issue #24. `requestScreenShareToggle` pure helper + `screen-share.ts` facade; call page renders a "Stop sharing" button while active and the remote tile shows a "Sharing screen" placeholder | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Device switching | `done` | Issue #25. `device-switcher.ts` pure helper; call page renders a mic + camera select; choices persist across sessions via `device-choice-storage.ts` | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Pause incoming video control | `done` | Issue #26. `remote-video-toggle.ts` calls `setSubscribed(trackSid, false)` for every remote video publication; call page renders Pause/Resume Video button and a "Remote video paused" placeholder | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Host remove participant | `done` | Issue #27 + #99. `POST /api/rooms/:slug/participants/:sessionId/remove` server route + `host-actions.ts` client wrapper + `use-room-moderation` hook on the room page; call page already had the Remove button via #27 | [docs/03-room-and-user-flows.md](docs/03-room-and-user-flows.md) |

## Phase 5: Small-Group Beta

| Feature | Status | Notes | Source |
| --- | --- | --- | --- |
| Raise room size to 4 participants | `done` | Issue #28. Default `maxParticipants` is now 4; validation cap stays at 4 | [docs/12-roadmap-and-release-phases.md](docs/12-roadmap-and-release-phases.md) |
| Group participant layout | `done` | Issue #29. Per-participant tiles on the call page via the participant-aware remote-renderer in `call-effects.ts` | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| SFU subscription tuning for groups | `done` | Issue #30. Group rooms (maxParticipants > 2) lower the local publish bitrate by 40% (floored at 80 kbps) via the new `applyGroupRoomTuning` helper in `apps/web/src/group-room-tuning.ts`. `connectToSfu` accepts the new `maxParticipants` input and applies the tuning only when the room is a group. `adaptiveStream` and `dynacast` were already on and continue to drive per-tile quality. | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Group beta validation metrics | `done` | Issue #31. In-process metrics module (`apps/server/src/domain/metrics.ts`) with counters for room create, join success/reject reasons, lobby decisions, passcode failures. Exposes a JSON `GET /api/metrics/summary` endpoint that returns the counter snapshot. Counters are emitted from the rooms route for the create + join paths. Prometheus export and OpenTelemetry traces are tracked as separate follow-up issues. | [docs/10-observability-and-operations.md](docs/10-observability-and-operations.md) |

## Cross-Cutting Infrastructure

| Feature | Status | Notes | Source |
| --- | --- | --- | --- |
| PostgreSQL room metadata | `done` | Issue #32. Slice 1: thin `pg.Pool` + `createPgClient` + idempotent `ensureLowtimeSchema` migration runner (`PR #106`). Slice 2: `PgRoomMetadataStore` implements the same `RoomStore` interface backed by `room_metadata` rows (`PR #115`). Wiring into `BuildAppOptions` is a follow-up (the in-memory store is still the default). | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |
| Redis live room state | `in_progress` | Issue #33. Five pure modules shipped: rate limiters (#101), presence (#105), lobby decisions (#109), reconnect window (#111), chat buffer (#113). Wired into `createRouteContext` only for the rate limiters via `createRedisClientFromEnv` (#102). Presence, lobby, reconnect, and chat still need the same wiring. Live smoke tests auto-skip when the user's private Redis at `192.168.21.2:16379` is unreachable. | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |
| coturn integration | `in_progress` | Issue #34. Slice 1: `generateTurnCredentials` pure helper + `turn-credentials.test.ts` (`PR #117`). Slice 2 (wire the credentials into the join response) and slice 3 (rotating-secret rotation) are still open. | [docs/02-system-architecture.md](docs/02-system-architecture.md) |
| Docker-based deployment packaging | `done` | Compose now defines web, server, postgres, redis, coturn, and optional LiveKit services | [docs/02-system-architecture.md](docs/02-system-architecture.md) |
| Metrics, logs, and dashboards | `in_progress` | Issue #36. In-process metrics (#31, #127), Prometheus exposition endpoint (#36 slice 1, #129), Grafana dashboard JSON (#36 slice 2, #119), and the import instructions (#36 slice 3, #121) are all shipped. OpenTelemetry traces are a separate follow-up. | [docs/10-observability-and-operations.md](docs/10-observability-and-operations.md) |
| Abuse and rate-limit controls | `done` | Issue #37. Per-IP room-create rate limiter (sliding window) and create-failures counter drop abusive clients. New pure module `apps/server/src/domain/room-create-rate-limiter.ts`; wiring in `apps/server/src/routes/rooms.ts`. Passcode and reclaim rate limiters already exist (#12, #13). | [docs/09-security-and-abuse.md](docs/09-security-and-abuse.md) |

## Refactor Program

| Feature | Status | Notes | Source |
| --- | --- | --- | --- |
| Web route-level page extraction | `done` | Issue #52. Extracted route-level pages and reduced `App.tsx` size materially | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Web styles extraction from `App.tsx` | `done` | Issue #53. Shared page styles already moved; chat-panel styles moved to a dedicated module | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Room and waiting feature-module split | `done` | Issue #54. Room and waiting effects/actions live in feature modules | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Call feature-module split | `done` | Issue #55. Call connection and media sync moved into `features/call/call-effects.ts` | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Preview and install feature-module split | `done` | Issue #56. Install and preview behavior moved into dedicated feature hooks | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Web route helpers and app shell | `done` | Issue #57. Added `app/routes.ts` and `app/app-shell.tsx` | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Server route registration split | `done` | Issue #58. Fastify route modules now own health, rooms, lobby, and media endpoints | [docs/08-backend-architecture.md](docs/08-backend-architecture.md) |
| Server room validation and status domain split | `done` | Issue #59. Validation and room status logic now live in domain modules | [docs/08-backend-architecture.md](docs/08-backend-architecture.md) |
| Server room-store domain split | `done` | Issue #60. In-memory store and lobby/session mutations moved into `domain/room-store.ts` | [docs/08-backend-architecture.md](docs/08-backend-architecture.md) |
| Server integration test split | `done` | Issue #61. Split route coverage into `rooms`, `lobby`, and `media` test files | [docs/08-backend-architecture.md](docs/08-backend-architecture.md) |
| Architecture docs for refactored structure | `done` | Issue #62. Updated frontend/backend architecture docs and contributor guidance to match the shipped layout | [docs/08-backend-architecture.md](docs/08-backend-architecture.md) |

## Followups (post-Phase 5)

| Persist chosen camera and microphone | `done` | Issue #97. `saveDeviceChoice` / `loadDeviceChoice` / `clearDeviceChoice` in `apps/web/src/device-choice-storage.ts`; sessionStorage under `lowtime:device-choice`. Call-page device switcher (#25) is the natural call site. | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Host remove from room page | `done` | Issue #99. `use-room-moderation` hook + Remove button in the room-page admitted-sessions list, reuses the call-page `host-actions.ts` wrapper. | [docs/03-room-and-user-flows.md](docs/03-room-and-user-flows.md) |
| Wire Redis presence into BuildAppOptions | `planned` | Use `createRedisPresence` when `REDIS_URL` is set; otherwise in-memory. Mirrors the rate-limiter wiring from #102. | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |
| Wire Redis lobby decisions into BuildAppOptions | `planned` | Same shape: `createRedisLobby` when `REDIS_URL` is set, otherwise the existing in-memory room-store path. | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |
| Wire Redis reconnect window into BuildAppOptions | `planned` | `createRedisReconnectState` when `REDIS_URL` is set. | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |
| Wire Redis chat buffer into BuildAppOptions | `planned` | `createRedisChatBuffer` when `REDIS_URL` is set; otherwise the ephemeral signaling-only chat from #23 stays the default. | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |
| Wire PG room metadata into BuildAppOptions | `planned` | `createPgRoomMetadataStore` when `PG_URL` is set; otherwise in-memory. The schema and store are already in main. | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |
| coturn slice 2: wire credentials into join response | `planned` | `POST /api/rooms/:slug/token` returns the LiveKit token + the freshly generated TURN credentials. Web client merges them into `iceServers` before connecting. | [docs/02-system-architecture.md](docs/02-system-architecture.md) |
| coturn slice 3: rotating-secret rotation | `planned` | Replace the static TURN secret with a rotating set of secrets so credentials issued at `now` verify against the secret set valid at `now`. | [docs/02-system-architecture.md](docs/02-system-architecture.md) |
| OpenTelemetry traces for join, token, reclaim, lobby | `planned` | Spec doc already calls this out. Spans the four flows; OTLP exporter; small set of attributes per span. | [docs/10-observability-and-operations.md](docs/10-observability-and-operations.md) |
| Client-side error reporting | `planned` | Sentry-style sink for frontend crashes and severe media setup failures. Today the network badge is the only client-side health surface. | [docs/10-observability-and-operations.md](docs/10-observability-and-operations.md) |
| Native wrappers (PWA -> TWA / Capacitor) | `planned` | Roadmap Future Work bullet. Evaluate after PWA demonstrates product fit. | [docs/12-roadmap-and-release-phases.md](docs/12-roadmap-and-release-phases.md) |
| Persistent identity | `planned` | Roadmap Future Work bullet. Revisit only if product usage shows a strong need. | [docs/12-roadmap-and-release-phases.md](docs/12-roadmap-and-release-phases.md) |

## Update Rule For Every PR
- If a feature changes status, update this file.
- If a feature is done, verify the matching source doc still describes the shipped behavior.
- If a feature is split into smaller deliverables, add rows here instead of hiding partial completion in commit messages.
