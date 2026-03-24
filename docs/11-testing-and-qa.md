# Testing And QA

- Purpose: Define the expected testing strategy, supported environments, and release gates for LowTime.
- Audience: Engineers, QA, and release owners.
- Status: Baseline
- Last Updated: 2026-03-24
- Related Docs: [Room And User Flows](03-room-and-user-flows.md), [Media And Quality](04-media-and-quality.md), [Observability And Operations](10-observability-and-operations.md)

## Overview
Testing for LowTime must cover product correctness and real-time reliability. The highest-risk areas are room admission, reconnect behavior, media fallback, and low-network adaptation. The testing strategy should combine fast unit coverage, integration coverage around room policy, and browser-driven end-to-end flows.

## Test Layers
- `Unit`
  - room policy rules
  - host secret validation
  - passcode verification
  - quality-cap clamping
  - adaptation state transitions
- `Integration`
  - room creation and expiry
  - direct join, lobby join, and passcode join
  - reclaim and reconnect flows
  - token issuance and fallback selection
- `End-to-end`
  - create room and join from second browser
  - chat during degraded video
  - live host setting changes
  - screen share on supported desktop browsers

## Suggested Tooling
- Vitest for unit tests
- Supertest or equivalent for API integration tests
- Playwright for end-to-end browser coverage
- Network shaping in CI or controlled local environments for low-bandwidth scenarios

## Browser And Device Matrix
- iPhone Safari
- Android Chrome
- Desktop Chrome
- Desktop Safari
- Desktop Edge

## Network Simulation Cases
- Stable Wi-Fi baseline
- Congested 4G with moderate packet loss
- Slow 3G-style uplink
- Intermittent disconnect and reconnect
- TURN-forced connectivity

## Acceptance Criteria
- A host can create a room and join without registration.
- A guest can join with only a display name when the room is open.
- Lobby and passcode flows behave as documented.
- 1:1 SFU failure offers P2P fallback.
- Audio-only prompt appears only after stepwise degradation.
- Chat still works when video is paused.
- Host quality cap prevents participants from exceeding allowed quality.

## Release Gates
- Unit and integration suites pass.
- Critical E2E join flows pass on supported browsers.
- No unresolved severity-1 issues in room creation, admission, reconnect, or media join.
- KPI dashboards are in place before beta launch.

## Edge Cases
- User denies permissions on the first attempt and allows them later.
- Participant rejoins during reconnect window after browser tab suspension.
- Screen share is attempted on a browser that reports partial support.

## Failure Modes
- Tests pass under ideal networking but not under packet loss.
- Browser automation misses iOS-specific permission quirks.
- Race conditions only appear under concurrent joins.

## Implementation Notes
- Treat race-condition tests as first-class, not optional hardening.
- Keep a reproducible manual checklist for mobile browsers even with strong automation.
- Update this doc when support scope changes.
