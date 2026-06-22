# Desktop Screen Share (Issue #24)

- Date: 2026-06-22
- Issue: #24 Phase 4: Desktop screen share
- Source of truth: `docs/04-media-and-quality.md` (Screen Share Rules section)
- Branch: `feature/24-desktop-screen-share`

## Problem
LowTime users need to share their screen during a 1:1 or small-group call.
The media doc already prescribes the rules:
- Support desktop screen share in browsers that expose screen-capture APIs.
- Hide the control on unsupported devices instead of blocking call entry.
- Screen share should take the primary tile position while active.
- The client may suggest turning off camera while screen sharing on weak links.

This design adds the minimum user-facing control and track wiring to satisfy
the first three rules. The host-disable toggle and weak-link auto-hint are
deferred to separate issues (smaller, reviewable PRs).

## Out Of Scope
- Host-level `allowScreenShare` room setting (separate issue).
- Automatic camera-off on weak links during share (separate issue).
- Tab-audio capture opt-in.
- Mobile/desktop detection beyond `getDisplayMedia` existence check.
- System "Stop sharing" bar handling beyond what `setScreenShareEnabled(false)` already does.

## Design

### 1. Pure track-selection helpers (`apps/web/src/call-experience.ts`)
Add two pure functions that take the existing `ParticipantLike` shape:

- `getActiveScreenShareTrack(participant)` — returns the first video publication whose track source is `"screen_share"` (or `"screenShare"` / `"screen-video"` — see Notes), ignoring muted tracks.
- `pickPrimaryVideoTrack(participant)` — returns `getActiveScreenShareTrack(participant)` when present, otherwise `getFirstVideoTrack(participant)`. Deterministic.

Extend `VideoTrackLike` with an optional `source?: string` field so test
mocks can mark tracks without pulling in `livekit-client` types.

### 2. Feature detection (`apps/web/src/screen-share.ts`)
- `isScreenShareSupported(): boolean` — returns `typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function"`.
- `isScreenShareTrackSource(source: string | undefined): boolean` — small predicate covering LiveKit's `Track.Source.ScreenShare`, `Track.Source.ScreenShareAudio`, and the kebab-cased `"screen-share"` form. Used by the helpers above.

### 3. Call-effects wiring (`apps/web/src/features/call/call-effects.ts`)
- New state: `isScreenSharing`, `isTogglingScreenShare`.
- `handleToggleScreenShare()`: calls `callRoomRef.current.localParticipant.setScreenShareEnabled(!isScreenSharing)`. Mirrors the mic/camera toggle pattern (loading flag, error string, finally reset).
- Update `syncCallPresentation`: when a new local video track is published, also stash it as the screen-share track if it matches `isScreenShareTrackSource(track.source)`. The existing `localVideoTrack` state is now driven by `pickPrimaryVideoTrack`, so the self-tile automatically shows the screen.
- When toggling off, also clear `localVideoTrack` if it pointed at a screen share that just went away (the next `localTrackUnpublished` event handles this through the existing sync).

### 4. UI (`apps/web/src/features/call/call-page.tsx` + `page-styles.ts`)
- New props: `isScreenShareSupported`, `isScreenSharing`, `isTogglingScreenShare`, `onToggleScreenShare`.
- Add a "Share Screen" / "Stop Sharing" button in the controls panel, rendered only when `isScreenShareSupported` and `callStatus === "connected" || isP2PConnected`.
- Reuse `secondaryControlStyle` for the button (no new style needed).
- Add a small `aria-live="polite"` caption "Sharing your screen" above the self-tile when `isScreenSharing` is true. Style via a new `screenShareCaptionStyle` in `page-styles.ts`.
- Self-tile `<video>` already uses `localVideoTrack`; changing the source helper in `call-effects.ts` to `pickPrimaryVideoTrack` is enough — no UI change to the `<video>` element.

### 5. Tests
- `apps/web/src/call-experience.test.ts` — add cases for `getActiveScreenShareTrack` (none / only camera / only screen / both with screen first / muted ignored) and `pickPrimaryVideoTrack` (screen wins over camera / no screen falls back to camera / null when neither).
- `apps/web/src/screen-share.test.ts` — new file. `isScreenShareSupported` truthy when `mediaDevices.getDisplayMedia` exists; falsy when absent. `isScreenShareTrackSource` accepts LiveKit's `Track.Source.ScreenShare`, `Track.Source.ScreenShareAudio`, and the kebab form; rejects `Track.Source.Camera` and `undefined`.
- Integration: add a `call-effects.test.ts` (new file) using the same plain-object mock style as `call-experience.test.ts`. Verify `handleToggleScreenShare` calls `setScreenShareEnabled(true)` on first click, `(false)` on second, and sets an error string when the underlying call rejects.

### 6. Docs
- `TODO.md`: move #24 from `planned` to `done` in the same PR. Update `Notes` with the helper file path and a one-liner about deferred work.
- `docs/04-media-and-quality.md`: append a short Implementation Notes bullet for screen share that cites `apps/web/src/screen-share.ts` and the helpers in `call-experience.ts`. Mirrors the P2P note style.

## Files Touched
- `apps/web/src/call-experience.ts` — add helpers, extend `VideoTrackLike`.
- `apps/web/src/call-experience.test.ts` — new test cases.
- `apps/web/src/screen-share.ts` — new file.
- `apps/web/src/screen-share.test.ts` — new file.
- `apps/web/src/features/call/call-effects.ts` — state, toggle handler, sync update.
- `apps/web/src/features/call/call-effects.test.ts` — new file.
- `apps/web/src/features/call/call-page.tsx` — new button + caption + props.
- `apps/web/src/features/page-styles.ts` — `screenShareCaptionStyle`.
- `docs/04-media-and-quality.md` — Implementation Notes bullet.
- `TODO.md` — status flip + notes.

## Acceptance
- [ ] All new and existing tests green.
- [ ] `npm --workspace apps/web run lint` clean.
- [ ] `npm --workspace apps/web run typecheck` clean (or root `npm run typecheck` if that is the configured one).
- [ ] Manual sanity: open the call page in a desktop browser, click Share Screen, see the self-tile swap, click Stop, see it revert.
- [ ] No new HTTP routes, no schema changes, no env changes.
- [ ] `TODO.md` shows #24 `done`. Source-of-truth doc notes the new helpers.

## Notes
- LiveKit's `Track.Source.ScreenShare` value is the string `"screen_share"`. The helper also accepts `"screenShare"` (older name) and `"screen-share"` (kebab form some LiveKit versions return) so the code is robust to small client-side renames.
- `setScreenShareEnabled(true)` triggers the browser's screen picker; failure inside that picker is surfaced through the `setScreenShareEnabled` promise rejection and lands in `callError`.
- This PR does not change `AdvancedMediaPrefs`, so no contract changes to `packages/shared`.
