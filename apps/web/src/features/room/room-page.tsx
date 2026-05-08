import { useEffect, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";

import type {
  AdvancedMediaPrefs,
  JoinRoomResponse,
  LobbyRequestSummary,
  QualityCap,
  QualityPreset,
  ResolutionCap,
  RoomSummary,
} from "@lowtime/shared";
import { clampPresetToCap } from "@lowtime/shared";

import type { PreviewState } from "../../device-preview.js";
import { getPreviewStateMessage, getQualityPresetLabel } from "../../device-preview.js";
import {
  controlsPanelStyle,
  hostQueueItemStyle,
  hostQueueStyle,
  joinPreviewGridStyle,
  mutedParagraphStyle,
  previewCardStyle,
  previewOptionsStyle,
  previewPlaceholderStyle,
  previewVideoStyle,
  tileHeaderStyle,
  tileHeadingStyle,
  toggleOptionStyle,
} from "../page-styles.js";

interface RoomPageProps {
  advancedPrefs: AdvancedMediaPrefs;
  displayName: string;
  hostLobbyError: string | null;
  hostLobbyRequests: LobbyRequestSummary[];
  hostSecret: string | null;
  isJoining: boolean;
  isLoadingRoom: boolean;
  joinError: string | null;
  joinResult: JoinRoomResponse | null;
  passcodeInput: string;
  previewAudioEnabled: boolean;
  previewError: string | null;
  previewState: PreviewState;
  previewVideoEnabled: boolean;
  previewVideoRef: RefObject<HTMLVideoElement | null>;
  reclaimStatus: "idle" | "checking" | "unlocked" | "needs-secret" | "unavailable";
  reclaimManualError: string | null;
  onSubmitReclaimSecret: (value: string) => Promise<void>;
  roomError: string | null;
  roomSummary: RoomSummary | null;
  selectedQualityPreset: QualityPreset;
  slug: string;
  onAdvancedPrefsChange: (updater: (current: AdvancedMediaPrefs) => AdvancedMediaPrefs) => void;
  onDisplayNameChange: (value: string) => void;
  onHostLobbyAction: (requestId: string, action: "approve" | "deny") => Promise<void>;
  onJoinRoom: () => Promise<void>;
  onPasscodeInputChange: (value: string) => void;
  onPreviewAudioChange: (checked: boolean) => void;
  onPreviewVideoChange: (checked: boolean) => void;
  onQualityPresetChange: (value: QualityPreset) => void;
  onStartPreview: () => Promise<void>;
}

/**
 * Returns the presets the current cap allows. Kept separate from
 * `clampPresetToCap` so the room page can render a consistent dropdown.
 */
export function listAllowedPresets(cap: QualityCap): QualityPreset[] {
  switch (cap) {
    case "low":
      return ["data_saver"];
    case "balanced":
      return ["data_saver", "balanced"];
    case "high":
      return ["data_saver", "balanced", "best_quality"];
  }
}

/**
 * Derives the user-visible passcode error from the current join response.
 * Returns null when there is no relevant error to show.
 */
export function derivePasscodeDeniedMessage(
  joinResult: JoinRoomResponse | null,
): string | null {
  if (joinResult?.joinState !== "denied") {
    return null;
  }
  if (joinResult.reason === "passcode_required") {
    return "Passcode is required for this room.";
  }
  if (joinResult.reason === "invalid_passcode") {
    return "That passcode is incorrect.";
  }
  return null;
}

export function RoomPage(props: RoomPageProps) {
  const passcodeInputRef = useRef<HTMLInputElement | null>(null);
  const passcodeDeniedMessage = derivePasscodeDeniedMessage(props.joinResult);
  const needsPasscodeInput = props.roomSummary?.accessMode === "passcode";
  const joinButtonDisabled =
    props.isJoining ||
    props.displayName.trim().length === 0 ||
    (needsPasscodeInput && props.passcodeInput.trim().length === 0);

  // Room-level quality cap may hide some preset options and may clamp the
  // current selection. We compute the effective preset once per render and
  // feed it back through the existing `selectedQualityPreset` prop.
  const qualityCap: QualityCap = props.roomSummary?.qualityCap ?? "high";
  const allowedPresets = listAllowedPresets(qualityCap);
  const effectiveQualityPreset = clampPresetToCap(props.selectedQualityPreset, qualityCap);

  // When the server rejects the join for a passcode reason, refocus the input
  // so the user can correct it without reaching for the mouse.
  useEffect(() => {
    if (passcodeDeniedMessage != null && passcodeInputRef.current != null) {
      passcodeInputRef.current.focus();
    }
  }, [passcodeDeniedMessage]);

  return (
    <main>
      <h1>LowTime</h1>
      <p>Open the room with only a display name, then move straight into the first SFU-backed call path.</p>
      <p>
        <strong>Room slug:</strong> {props.slug}
      </p>
      {props.isLoadingRoom ? <p>Loading room details...</p> : null}
      {props.roomError ? <p role="alert">{props.roomError}</p> : null}
      {props.roomSummary ? (
        <>
          <section>
            <h2>Room Preview</h2>
            <p>
              Access mode: <strong>{props.roomSummary.accessMode}</strong>
            </p>
            <p>
              Max participants: <strong>{props.roomSummary.maxParticipants}</strong>
            </p>
            <p>
              Quality cap: <strong>{props.roomSummary.qualityCap}</strong>
            </p>
            <p>
              Expires at: <strong>{new Date(props.roomSummary.expiresAt).toLocaleString()}</strong>
            </p>
          </section>
          <section>
            <h2>Join Room</h2>
            <div style={joinPreviewGridStyle}>
              <section style={previewCardStyle}>
                <div style={tileHeaderStyle}>
                  <h3 style={tileHeadingStyle}>Device Preview</h3>
                  <span>{getQualityPresetLabel(props.selectedQualityPreset)}</span>
                </div>
                {props.previewState === "ready" && props.previewVideoEnabled ? (
                  <video
                    ref={props.previewVideoRef}
                    autoPlay
                    muted
                    playsInline
                    style={previewVideoStyle}
                  />
                ) : (
                  <div style={previewPlaceholderStyle}>
                    <strong>{props.previewVideoEnabled ? "Preview ready when you are" : "Audio-only join selected"}</strong>
                    <p style={mutedParagraphStyle}>{getPreviewStateMessage(props.previewState, props.previewError)}</p>
                  </div>
                )}
                <div style={previewOptionsStyle}>
                  <label style={toggleOptionStyle}>
                    <input
                      type="checkbox"
                      checked={props.previewAudioEnabled}
                      onChange={(event) => props.onPreviewAudioChange(event.target.checked)}
                    />
                    Start with microphone
                  </label>
                  <label style={toggleOptionStyle}>
                    <input
                      type="checkbox"
                      checked={props.previewVideoEnabled}
                      onChange={(event) => props.onPreviewVideoChange(event.target.checked)}
                    />
                    Start with camera
                  </label>
                  <label style={toggleOptionStyle}>
                    Quality preset
                    <select
                      value={effectiveQualityPreset}
                      onChange={(event) => props.onQualityPresetChange(event.target.value as QualityPreset)}
                    >
                      {allowedPresets.includes("data_saver") ? (
                        <option value="data_saver">Data Saver</option>
                      ) : null}
                      {allowedPresets.includes("balanced") ? (
                        <option value="balanced">Balanced</option>
                      ) : null}
                      {allowedPresets.includes("best_quality") ? (
                        <option value="best_quality">Best Quality</option>
                      ) : null}
                    </select>
                  </label>
                </div>
                <button type="button" onClick={() => void props.onStartPreview()} disabled={props.previewState === "requesting"}>
                  {props.previewState === "requesting" ? "Starting Preview..." : "Start Device Preview"}
                </button>
              </section>
            </div>
            <label>
              Display name
              <input
                type="text"
                value={props.displayName}
                onChange={(event) => props.onDisplayNameChange(event.target.value)}
                placeholder="Enter your name"
              />
            </label>
            {needsPasscodeInput ? (
              <label>
                Passcode
                <input
                  ref={passcodeInputRef}
                  type="password"
                  value={props.passcodeInput}
                  onChange={(event) => props.onPasscodeInputChange(event.target.value)}
                  placeholder="Enter the room passcode"
                  autoComplete="off"
                />
              </label>
            ) : null}
            <AdvancedMediaControls
              advancedPrefs={props.advancedPrefs}
              onChange={props.onAdvancedPrefsChange}
            />
            <div>
              <button type="button" onClick={() => void props.onJoinRoom()} disabled={joinButtonDisabled}>
                {props.isJoining ? "Joining..." : "Join Room"}
              </button>
            </div>
            {props.joinError ? <p role="alert">{props.joinError}</p> : null}
            {passcodeDeniedMessage != null ? (
              <p role="alert">{passcodeDeniedMessage}</p>
            ) : null}
            {props.joinResult?.joinState === "waiting" ? (
              <p>
                Waiting for host approval. Request <code>{props.joinResult.requestId}</code> is queued.
              </p>
            ) : null}
            {props.joinResult?.joinState === "denied" &&
            props.joinResult.reason !== "passcode_required" &&
            props.joinResult.reason !== "invalid_passcode" ? (
              <p>
                Join denied: <strong>{props.joinResult.reason}</strong>
              </p>
            ) : null}
          </section>
          {props.roomSummary.accessMode === "lobby" && props.hostSecret && props.reclaimStatus === "unlocked" ? (
            <section style={previewCardStyle}>
              <div style={tileHeaderStyle}>
                <h2 style={tileHeadingStyle}>Host Lobby Queue</h2>
                <span>{props.hostLobbyRequests.length} pending</span>
              </div>
              {props.hostLobbyRequests.length === 0 ? (
                <p style={mutedParagraphStyle}>No one is waiting right now.</p>
              ) : (
                <div style={hostQueueStyle}>
                  {props.hostLobbyRequests.map((request) => (
                    <article key={request.requestId} style={hostQueueItemStyle}>
                      <div>
                        <strong>{request.displayName}</strong>
                        <p style={mutedParagraphStyle}>
                          Requested at {new Date(request.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <div style={controlsPanelStyle}>
                        <button type="button" onClick={() => void props.onHostLobbyAction(request.requestId, "approve")}>
                          Approve
                        </button>
                        <button type="button" onClick={() => void props.onHostLobbyAction(request.requestId, "deny")}>
                          Deny
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {props.hostLobbyError ? <p role="alert">{props.hostLobbyError}</p> : null}
            </section>
          ) : null}
          {props.reclaimStatus === "unavailable" ? (
            <section style={previewCardStyle}>
              <p role="alert">This room is no longer available.</p>
            </section>
          ) : null}
          {props.reclaimStatus === "needs-secret" ? (
            <ManualReclaimForm
              manualError={props.reclaimManualError}
              onSubmit={props.onSubmitReclaimSecret}
            />
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function ManualReclaimForm(props: {
  manualError: string | null;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [secret, setSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const disabled = secret.trim().length === 0 || isSubmitting;

  useEffect(() => {
    if (props.manualError != null && inputRef.current != null) {
      inputRef.current.focus();
    }
  }, [props.manualError]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) {
      return;
    }
    setIsSubmitting(true);
    try {
      await props.onSubmit(secret);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section style={previewCardStyle}>
      <form onSubmit={handleSubmit} aria-labelledby="reclaim-heading">
        <h2 id="reclaim-heading" style={tileHeadingStyle}>
          Reclaim host role
        </h2>
        <p style={mutedParagraphStyle}>
          Paste the host secret you were shown when the room was created.
        </p>
        <label>
          Host secret
          <input
            ref={inputRef}
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Paste host secret"
            autoComplete="off"
          />
        </label>
        <div>
          <button type="submit" disabled={disabled}>
            {isSubmitting ? "Reclaiming..." : "Reclaim Host Role"}
          </button>
        </div>
        {props.manualError ? <p role="alert">{props.manualError}</p> : null}
      </form>
    </section>
  );
}


const RESOLUTION_CAPS: ResolutionCap[] = ["240p", "360p", "480p", "720p"];

function AdvancedMediaControls(props: {
  advancedPrefs: AdvancedMediaPrefs;
  onChange: (updater: (current: AdvancedMediaPrefs) => AdvancedMediaPrefs) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  function updateField<K extends keyof AdvancedMediaPrefs>(
    key: K,
    value: AdvancedMediaPrefs[K] | undefined,
  ) {
    props.onChange((current) => {
      const next = { ...current };
      if (value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }

  return (
    <section style={previewCardStyle}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="advanced-media-controls-panel"
      >
        {isOpen ? "Hide Advanced Media Controls" : "Show Advanced Media Controls"}
      </button>
      {isOpen ? (
        <div id="advanced-media-controls-panel" style={previewOptionsStyle}>
          <label style={toggleOptionStyle}>
            Max send resolution
            <select
              value={props.advancedPrefs.maxResolution ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                updateField(
                  "maxResolution",
                  value === "" ? undefined : (value as ResolutionCap),
                );
              }}
            >
              <option value="">Use preset default</option>
              {RESOLUTION_CAPS.map((cap) => (
                <option key={cap} value={cap}>
                  {cap}
                </option>
              ))}
            </select>
          </label>
          <label style={toggleOptionStyle}>
            Max FPS
            <input
              type="number"
              min={1}
              max={60}
              value={props.advancedPrefs.maxFps ?? ""}
              placeholder="Preset default"
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "") {
                  updateField("maxFps", undefined);
                  return;
                }
                const parsed = Number.parseInt(raw, 10);
                if (Number.isFinite(parsed) && parsed > 0) {
                  updateField("maxFps", parsed);
                }
              }}
            />
          </label>
          <label style={toggleOptionStyle}>
            Max video bitrate (kbps)
            <input
              type="number"
              min={50}
              step={50}
              value={props.advancedPrefs.maxBitrateKbps ?? ""}
              placeholder="Preset default"
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "") {
                  updateField("maxBitrateKbps", undefined);
                  return;
                }
                const parsed = Number.parseInt(raw, 10);
                if (Number.isFinite(parsed) && parsed > 0) {
                  updateField("maxBitrateKbps", parsed);
                }
              }}
            />
          </label>
          <label style={toggleOptionStyle}>
            <input
              type="checkbox"
              checked={props.advancedPrefs.audioPriority === true}
              onChange={(event) =>
                updateField("audioPriority", event.target.checked || undefined)
              }
            />
            Prioritize audio on weak links
          </label>
          <label style={toggleOptionStyle}>
            <input
              type="checkbox"
              checked={props.advancedPrefs.audioOnly === true}
              onChange={(event) =>
                updateField("audioOnly", event.target.checked || undefined)
              }
            />
            Join audio-only (no outbound video)
          </label>
          <label style={toggleOptionStyle}>
            <input
              type="checkbox"
              checked={props.advancedPrefs.receiveVideo === false}
              onChange={(event) =>
                // `receiveVideo` defaults to true; only store the override
                // when the user explicitly pauses incoming video.
                updateField("receiveVideo", event.target.checked ? false : undefined)
              }
            />
            Pause incoming video
          </label>
        </div>
      ) : null}
    </section>
  );
}
