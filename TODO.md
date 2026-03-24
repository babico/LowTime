# LowTime Implementation Tracker

- Purpose: Track implementation progress feature by feature and provide one living checklist that must be updated whenever work lands.
- Audience: Engineers, reviewers, and release owners.
- Status: Active
- Last Updated: 2026-03-24
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
| Tooling | Monorepo scaffolding | `planned` | Create `apps/web`, `apps/server`, and `packages/shared` | [docs/12-roadmap-and-release-phases.md](docs/12-roadmap-and-release-phases.md) |
| Tooling | CI and linting baseline | `planned` | Add repo checks before feature work grows | [docs/12-roadmap-and-release-phases.md](docs/12-roadmap-and-release-phases.md) |

## Phase 1: Core 1:1 Calling

| Feature | Status | Notes | Source |
| --- | --- | --- | --- |
| Room creation endpoint and share link | `planned` | Includes host secret issuance | [docs/05-api-and-realtime-contracts.md](docs/05-api-and-realtime-contracts.md) |
| Public join flow with display name | `planned` | No registration required | [docs/03-room-and-user-flows.md](docs/03-room-and-user-flows.md) |
| Join screen with device preview | `planned` | Includes permission flow and preset selection | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| SFU integration for 1:1 rooms | `planned` | LiveKit is the default media path | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Basic in-call UI | `planned` | Remote tile, local self-view, leave/mute/camera controls | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |
| Network health badge | `planned` | Surface degraded connectivity to the user | [docs/10-observability-and-operations.md](docs/10-observability-and-operations.md) |
| PWA shell and installability | `planned` | Manifest, shell caching, and install prompt behavior | [docs/07-frontend-architecture.md](docs/07-frontend-architecture.md) |

## Phase 2: Admission Control And Recovery

| Feature | Status | Notes | Source |
| --- | --- | --- | --- |
| Lobby mode | `planned` | Waiting room plus host approval | [docs/03-room-and-user-flows.md](docs/03-room-and-user-flows.md) |
| Passcode-protected rooms | `planned` | Validate before token issuance | [docs/09-security-and-abuse.md](docs/09-security-and-abuse.md) |
| Host reclaim after refresh | `planned` | Restore host role from host secret | [docs/03-room-and-user-flows.md](docs/03-room-and-user-flows.md) |
| Reconnect window and session recovery | `planned` | Preserve identity during short disconnects | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |
| Room expiry and cleanup jobs | `planned` | Expire inactive rooms and trim transient state | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |

## Phase 3: Flexible Quality Controls

| Feature | Status | Notes | Source |
| --- | --- | --- | --- |
| Quality presets | `planned` | Data Saver, Balanced, Best Quality | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Advanced media controls | `planned` | Resolution, FPS, bitrate, audio priority, receive-video, audio-only | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Host quality cap | `planned` | Host can limit room max quality | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Live room settings updates | `planned` | Access mode and quality changes during a call | [docs/05-api-and-realtime-contracts.md](docs/05-api-and-realtime-contracts.md) |
| Automatic low-network downgrade | `planned` | Bitrate -> resolution -> frame rate -> video pause | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| Audio-only prompt flow | `planned` | Prompt after repeated instability | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |
| 1:1 P2P fallback after SFU failure | `planned` | 1:1 only, no group mesh fallback | [docs/04-media-and-quality.md](docs/04-media-and-quality.md) |

## Phase 4: Collaboration Features

| Feature | Status | Notes | Source |
| --- | --- | --- | --- |
| Lightweight in-room chat | `planned` | Ephemeral signaling-backed chat | [docs/05-api-and-realtime-contracts.md](docs/05-api-and-realtime-contracts.md) |
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
| PostgreSQL room metadata | `planned` | Durable room state and audit events | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |
| Redis live room state | `planned` | Presence, lobby, reconnect, rate limits, chat buffer | [docs/06-data-model-and-lifecycle.md](docs/06-data-model-and-lifecycle.md) |
| coturn integration | `planned` | NAT traversal and relay support | [docs/02-system-architecture.md](docs/02-system-architecture.md) |
| Metrics, logs, and dashboards | `planned` | Product, media, and abuse visibility | [docs/10-observability-and-operations.md](docs/10-observability-and-operations.md) |
| Abuse and rate-limit controls | `planned` | Protect room creation and join paths | [docs/09-security-and-abuse.md](docs/09-security-and-abuse.md) |

## Update Rule For Every PR
- If a feature changes status, update this file.
- If a feature is done, verify the matching source doc still describes the shipped behavior.
- If a feature is split into smaller deliverables, add rows here instead of hiding partial completion in commit messages.
