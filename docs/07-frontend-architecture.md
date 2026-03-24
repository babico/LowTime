# Frontend Architecture

- Purpose: Describe the route structure, UI ownership, state boundaries, and client-side responsibilities for the LowTime web app.
- Audience: Frontend engineers and designers.
- Status: Baseline
- Last Updated: 2026-03-24
- Related Docs: [Product Overview](01-product-overview.md), [Room And User Flows](03-room-and-user-flows.md), [Media And Quality](04-media-and-quality.md), [ADR-003](adr/ADR-003-pwa-first.md)

## Overview
The frontend is a React + TypeScript PWA optimized for mobile browsers first. It owns room creation, join flow, device preview, in-call controls, reconnect UX, and local media adaptation. Server-side policy remains authoritative; the client reflects and requests changes but does not invent policy.

## Route Structure
- `/`
  - landing page with create-room CTA and join-by-link helper
- `/r/:slug`
  - join screen, room status, device preview, access validation
- `/r/:slug/waiting`
  - lobby waiting state when admission requires approval
- `/r/:slug/call`
  - in-call screen with media, host controls, chat, settings, and reconnect banners

## Page Responsibilities
- `Landing`
  - explain the product briefly
  - create room
  - route into join preview
- `Join`
  - collect display name
  - collect passcode when needed
  - request media permissions after user intent
  - choose quality preset
- `Waiting`
  - show lobby state and cancellation path
- `Call`
  - render participant tiles
  - manage local media controls
  - show host tray, chat drawer, settings drawer, and network status

## State Boundaries
- `App state`
  - routing, install prompts, theme, service-worker state
- `Room state`
  - room settings, participant roster, host privileges, lobby state
- `Media state`
  - local tracks, remote tracks, selected transport, network quality, advanced preferences
- `Device state`
  - available cameras, microphones, speakers, permissions, hardware errors
- `UI state`
  - which drawer or modal is open, pending toasts, banners

## Media Controller Responsibilities
- Acquire and release local tracks
- Apply preset and advanced quality settings
- Run network adaptation
- Handle SFU connect and 1:1 P2P fallback switch
- Expose media status to the room store

## Responsive Behavior
- Mobile:
  - single dominant remote tile
  - bottom-sheet drawers for chat, settings, and host controls
  - compact control bar sized for touch
- Desktop:
  - larger multi-pane layout
  - side drawers for chat and settings
  - floating or inline host controls

## Component Ownership
- `app-shell`
  - router, providers, PWA hooks
- `room-entry`
  - create, join, preview, waiting
- `call-experience`
  - participant layout, transport state, reconnect UX
- `host-controls`
  - access mode, quality cap, room size, moderation actions
- `chat`
  - ephemeral room chat drawer
- `settings`
  - presets and advanced controls

## Edge Cases
- Browser denies media permissions after the user has already joined.
- Device list changes while the settings drawer is open.
- Room settings change while a guest is on the join screen.

## Failure Modes
- Service worker caches stale shell code after a breaking contract change.
- Client thinks the user is host but reclaim validation fails.
- Media acquisition works but speaker selection is unsupported.

## Implementation Notes
- Keep contract types in a shared package consumed by the client.
- Build the media controller as a dedicated subsystem rather than mixing it into UI components.
- Treat PWA support as shell enhancement, not as offline call support.
