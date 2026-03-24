# Roadmap And Release Phases

- Purpose: Define the delivery sequence from docs-first planning to a stable MVP and a small-group beta.
- Audience: Engineering leads, product, and release owners.
- Status: Baseline
- Last Updated: 2026-03-24
- Related Docs: [Product Overview](01-product-overview.md), [Testing And QA](11-testing-and-qa.md), [ADR Index](adr/README.md)

## Overview
The delivery plan prioritizes the smallest viable real-time path first, then layers in admission control, reconnect reliability, flexible quality controls, and finally small-group hardening. Each phase should leave the product in a shippable or demoable state.

## Phase 0: Docs And Scaffolding
- Deliver the root docs package and ADR baseline.
- Scaffold the monorepo structure for web, server, and shared contracts.
- Exit criteria:
  - docs package accepted
  - package layout chosen
  - CI and linting baseline defined

## Phase 1: Core 1:1 Calling
- Build room creation and public join flow.
- Implement open rooms only.
- Integrate SFU join path.
- Ship basic call screen with mute, camera, leave, and network badge.
- Exit criteria:
  - host can create and share a room
  - guest can join with display name only
  - stable 1:1 call works on supported browsers

## Phase 2: Admission Control And Recovery
- Add lobby and passcode modes.
- Add host reclaim after refresh.
- Add reconnect window and reconnect UX.
- Exit criteria:
  - access modes work without restart
  - reconnect restores sessions within target window
  - room expiry and cleanup are reliable

## Phase 3: Flexible Quality Controls
- Add presets and advanced media settings.
- Add host quality cap and live room settings updates.
- Add audio-only suggestion flow.
- Exit criteria:
  - users can lower quality at will
  - host caps are enforced correctly
  - poor-network downgrade flow works end to end

## Phase 4: Collaboration Features
- Add lightweight chat.
- Add desktop screen share.
- Add receive-video pause and stronger device controls.
- Exit criteria:
  - chat survives degraded media
  - desktop screen share is stable on supported browsers
  - core device-switching flows are covered

## Phase 5: Small-Group Beta
- Raise supported room size to 4 participants.
- Harden SFU subscription logic and participant layout.
- Validate group quality metrics before broader rollout.
- Exit criteria:
  - 4-person rooms are labeled beta
  - performance metrics meet beta thresholds
  - fallback behavior remains safe and predictable

## Dependencies
- Phase 2 depends on durable room and host-secret handling from Phase 1.
- Phase 3 depends on media stats and room policy wiring from earlier phases.
- Phase 5 depends on observability maturity from Phases 2 through 4.

## Future Work
- Evaluate thin native wrappers after the PWA demonstrates product fit.
- Consider richer moderation and room controls once abuse patterns are understood.
- Revisit persistent identity only if product usage shows a strong need.
