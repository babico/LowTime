# Product Overview

- Purpose: Define the user problem, intended audience, product scope, and guiding principles for LowTime.
- Audience: Product, design, frontend, backend, and operations contributors.
- Status: Baseline
- Last Updated: 2026-03-24
- Related Docs: [Docs Map](00-docs-map.md), [Room And User Flows](03-room-and-user-flows.md), [ADR-001](adr/ADR-001-no-registration.md), [ADR-004](adr/ADR-004-1to1-core-small-group-beta.md)

## Overview
LowTime is a low-bandwidth, registration-free web calling app. A user creates a room, shares a link, and other people join by entering only a display name. The main experience must feel lightweight, immediate, and forgiving on poor networks.

## Target Users
- People on weak 3G, congested 4G, or unstable Wi-Fi.
- Users who want fast personal calls without account creation.
- Small teams, friends, or families who need quick ad hoc calls.
- Users on mobile browsers first, with desktop support for richer controls and screen sharing.

## Problem Statement
Mainstream video apps often assume stable bandwidth, persistent identities, and heavier onboarding. LowTime should reduce all three burdens by removing registration, prioritizing audio continuity, and giving users fast ways to trade quality for stability.

## Goals
- Let a host create and share a room in seconds.
- Let a guest join with only a display name.
- Keep 1:1 calls usable on weak connections.
- Support live access control changes without restarting the room.
- Offer both simple presets and advanced controls for users who need more control.

## Non-Goals
- Full social graph, contacts, or messaging history.
- Recording, file sharing, or large meeting features.
- Native mobile apps in the first release.
- Enterprise admin features.

## V1 Scope
- Anonymous room creation with a short link.
- Join screen with display name, optional passcode, and device preview.
- Audio and video calling.
- Lightweight in-room chat.
- Host controls for open, lobby, and passcode admission.
- Manual quality presets and advanced bandwidth controls.
- Desktop screen sharing on supported browsers.
- PWA installability for mobile-friendly launch.

## V2 Direction
- Improve group-calling quality for the 4-person beta path.
- Add richer reconnect analytics and moderation tools.
- Evaluate thin native wrappers after the PWA proves product fit.

## Product Principles
- `Fast by default`: The shortest path to a live call wins.
- `Audio first`: Conversation continuity is more important than sharp video.
- `Flexible when needed`: Simple presets for most people, advanced controls for power users.
- `Private by design`: Store as little durable user data as possible.
- `Docs stay current`: Product behavior must remain documented as implementation grows.

## Edge Cases
- A guest opens an expired or invalid link.
- A room reaches its participant limit mid-join.
- The host changes access mode while a guest is on the join screen.
- The user's browser blocks media permissions or lacks screen share support.

## Failure Modes
- Network is too weak for live video and the app must suggest audio-only mode.
- Media transport setup fails and the room must retry or switch transport.
- Host loses local host secret and can no longer reclaim privileges after refresh.

## Implementation Notes
- Default quality optimization is for 1:1 calls.
- Up to 4 participants is supported as a beta mode, not as the primary success target.
- Design decisions are recorded in the ADRs instead of being repeated here.
