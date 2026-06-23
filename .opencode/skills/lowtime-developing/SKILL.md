---
name: lowtime-developing
description: Use when working on LowTime ÔÇö a low-bandwidth FaceTime-like WebRTC app. Triggers on web/server code in apps/, packages/shared, docs/, TODO.md, call/room feature work, LiveKit, SFU/P2P fallback, quality presets, media adaptation, signaling, or PRs.
---

# LowTime Developing

## What LowTime Is
- Low-bandwidth WebRTC video call app: SFU-first, P2P fallback for 1:1, in-memory state.
- User promise: stay on the call even when network is bad ÔÇö adapt before dropping.

## Core Principle: Bandwidth Is Sacred
Every new feature spends bytes. Default to the cheapest option that works.

- New video/screen source: must justify bandwidth cost in `docs/04-media-and-quality.md`.
- New toggle/control: prefer adding to existing `AdvancedMediaPrefs` shape, not inventing a new payload.
- New signaling event: route through `WS /signal` and `SignalBus` (`apps/server/src/domain/signal-bus.ts`) ÔÇö do not add new HTTP routes for ephemeral state.
- Default to `Balanced` preset for any new publish path. Never `Best Quality` as default.

## Architecture Map (read before changing)
| Layer | Where | Notes |
| --- | --- | --- |
| Web routes | `apps/web/src/app/` | Routing + shell only |
| Web features | `apps/web/src/features/<area>/` | One folder per page area (call, room, home, waiting) |
| Web shared helpers | `apps/web/src/*.ts` (top level) | `call-experience.ts`, `media-controller.ts`, `auto-downgrade.ts`, `audio-only-prompt.ts`, `quality-presets.ts`, `room-entry.ts`, `network-health.ts`, `device-preview.ts` |
| Server routes | `apps/server/src/routes/` | One file per route group (rooms, lobby, media, signal) |
| Server domain | `apps/server/src/domain/` | Pure logic: room-store, room-cleanup, room-activity, signal-bus, validation |
| Shared types | `packages/shared/src/index.ts` | Contract types consumed by both apps |
| Docs | `docs/` | Source of truth ÔÇö update in same PR as code |

## Mandatory Workflow (from `docs/13-issue-branch-pr-workflow.md`)
1. Pick or open a GitHub issue first. Use `.github/ISSUE_TEMPLATE/feature.yml` or `bug.yml`.
2. Branch from `main` named `feature/<topic>`, `fix/<topic>`, or `docs/<topic>`.
3. Update `TODO.md` to `in_progress` before coding; mark `done` only when tests + docs land.
4. Code + tests + docs land in the same PR.
5. Push branch, open PR, link issue, request review.
6. `babico` + `codex` reviewers via repo workflow. Manual `@codex review` only if auto-review skipped.

## Test Conventions
- Web unit tests: `apps/web/src/<file>.test.ts` using `node:test` + `node:assert/strict` (see `package.json` test script).
- Pattern: pure helpers in their own `.ts` file with sibling `.test.ts`. No React Testing Library ÔÇö use a plain object mocking style (see `call-experience.test.ts`).
- Run: `npm test` (workspace) or `npm --workspace apps/web test`.
- Lint: `npm run lint` (max-warnings 0).

## Source-Of-Truth Doc Rules
- `docs/04-media-and-quality.md` ÔÇö any change to media transport, presets, downgrade, screen share, advanced controls.
- `docs/05-api-and-realtime-contracts.md` ÔÇö any new endpoint, signaling event, or payload shape.
- `docs/06-data-model-and-lifecycle.md` ÔÇö any change to session, room, or stored state.
- `docs/09-security-and-abuse.md` ÔÇö any change to auth, rate limit, passcode, lobby.
- `TODO.md` ÔÇö every status change.
- ADR required when changing: default transport, access model, persistence model, install surface, or quality policy.

## Definition Of Done (from `CONTRIBUTING.md`)
- Tests added/updated.
- `TODO.md` status correct.
- Source-of-truth docs updated.
- ADR added/revised if architecture changed.
- `npm run lint` clean, `npm test` green, typecheck green.

## Project Vocabulary (use exact terms)
- **SFU** (default transport) vs **P2P fallback** (1:1 only, after SFU failure).
- **Preset** = `Data Saver` | `Balanced` | `Best Quality` (user choice).
- **Quality cap** = host-imposed ceiling on preset. Always clamps before user.
- **AdvancedMediaPrefs** = 6 user overrides; can only tighten, never loosen, the cap+preset baseline.
- **Rung** = one step in the downgrade ladder (`bitrate ÔåÆ resolution ÔåÆ fps ÔåÆ video-paused`).
- **Tile** = a `<video>` element in the call layout (remote + self).
- **Session** = per-tab `StoredCallSession`; cleared on leave.

## Common Mistakes
- Touching `App.tsx` directly ÔÇö page logic lives in `features/<area>/`.
- Adding a new HTTP route for ephemeral state ÔÇö use `SignalBus` instead.
- Forgetting `npm run lint` after edits ÔÇö CI fails on any warning.
- Marking a feature `done` in `TODO.md` before tests + docs land.
- Skipping the issue/PR template ÔÇö `babico` and `codex` auto-review require the structured context.
- Optimistic bandwidth defaults ÔÇö every new path must check `docs/04` for the right baseline.
