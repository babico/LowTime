# Frontend Architecture

- Purpose: Describe the route structure, UI ownership, state boundaries, and client-side responsibilities for the LowTime web app.
- Audience: Frontend engineers and designers.
- Status: Baseline
- Last Updated: 2026-03-25
- Related Docs: [Product Overview](01-product-overview.md), [Room And User Flows](03-room-and-user-flows.md), [Media And Quality](04-media-and-quality.md), [ADR-003](adr/ADR-003-pwa-first.md)

## Overview
The frontend is a React + TypeScript PWA optimized for mobile browsers first. It owns room creation, join flow, device preview, in-call controls, reconnect UX, and local media adaptation. Server-side policy remains authoritative; the client reflects and requests changes but does not invent policy.

## Source Layout
- `apps/web/src/App.tsx`
  - top-level state orchestration only
- `apps/web/src/app/routes.ts`
  - route parsing, route path helpers, and push-state helpers
- `apps/web/src/app/app-shell.tsx`
  - route-based page selection
- `apps/web/src/features/home/`
  - landing page UI and install-prompt behavior
- `apps/web/src/features/room/`
  - join page UI, room loading, join actions, and device preview behavior
- `apps/web/src/features/waiting/`
  - waiting-room polling and waiting-page UI
- `apps/web/src/features/call/`
  - call-page UI and call connection/media lifecycle
- `apps/web/src/features/page-styles.ts`
  - shared inline style objects used by the current UI
- `apps/web/src/room-entry.ts`
  - stored-session helpers, URL-derived view state, and route-adjacent persistence helpers
- `apps/web/src/media-controller.ts`
  - LiveKit connection bridge for the web client
- `apps/web/src/call-experience.ts`
  - participant/track selection helpers used by the call flow
- `apps/web/src/network-health.ts`
  - network badge heuristics
- `apps/web/src/device-preview.ts`
  - pure preview constraint and preview message helpers
- `apps/web/src/pwa.ts`
  - service-worker and install prompt helper functions

## Route Structure
- `/`
  - landing page with create-room CTA and join-by-link helper
- `/r/:slug`
  - join screen, room status, device preview, access validation
- `/r/:slug/waiting/:requestId`
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
  - view-state routing, room create flow, shared cross-route form state, network badge state
- `Room state`
  - room settings, participant roster, host privileges, lobby state
- `Media state`
  - local tracks, remote tracks, selected transport, network quality, advanced preferences
- `Device state`
  - available cameras, microphones, speakers, permissions, hardware errors
- `UI state`
  - which drawer or modal is open, pending toasts, banners

Current implementation boundary:
- `App.tsx` owns routing, create-room flow, shared join inputs, and cross-feature coordination.
- Feature hooks own route-specific effects:
  - `useRoomPageData`
  - `useWaitingRoomState`
  - `useCallFlow`
  - `useDevicePreview`
  - `useInstallPrompt`

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
  - route rendering only
- `routes`
  - pathname parsing and navigation helpers
- `home-page`
  - create-room landing experience
- `room-page`
  - join form, room summary, device preview, and host lobby queue
- `waiting-page`
  - waiting-room status and back-to-join action
- `call-page`
  - connected call UI and control surface
- `call-effects`
  - token request, LiveKit room connection, participant sync, and call control handlers
- `room-effects`
  - room summary loading and host lobby queue refresh
- `waiting-effects`
  - waiting-room polling and approval transition handling
- `preview-effects`
  - preview media stream lifecycle and preview state
- `install-effects`
  - install prompt lifecycle and install status messaging

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
- Current implementation supports room creation, display-name join on `/r/:slug`, a join-side device preview with media toggles and quality preset selection, a `/r/:slug/waiting/:requestId` polling flow for lobby rooms, host-side pending-request controls on the room page, and a basic `/r/:slug/call` route with local self-view, remote tile area, mute/camera/leave controls, a lightweight network health badge, and an installable PWA shell with manifest, service-worker registration, and landing-page install prompt behavior on top of LiveKit.
- The current refactor direction is feature-slice oriented on the frontend:
  - page UI stays under `features/<area>/`
  - route-specific effects live beside the page they support
  - generic helpers remain in top-level utility modules until a shared-lib layer becomes necessary
