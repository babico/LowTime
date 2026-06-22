import type { RefObject } from "react";

import type { ChatMessage, RoomParticipant } from "@lowtime/shared";
import type { StoredCallSession } from "../../room-entry.js";
import type { NetworkHealth } from "../../network-health.js";
import { getNetworkHealthLabel } from "../../network-health.js";
import type { DowngradeRung } from "../../auto-downgrade.js";
import { getRungLabel } from "../../auto-downgrade.js";
import type { PromptState } from "../../audio-only-prompt.js";
import type { P2PCallStatus } from "./call-effects.js";
import { ChatPanel } from "./chat-panel.js";
import {
  callFactsStyle,
  callHeaderBadgeRowStyle,
  callHeaderStyle,
  callLayoutStyle,
  callPageStyle,
  callStatusBadgeStyle,
  controlsPanelStyle,
  dangerControlStyle,
  localVideoStyle,
  metaTextStyle,
  mutedParagraphStyle,
  networkBadgeStyle,
  remoteTileStyle,
  remoteVideoStyle,
  secondaryControlStyle,
  selfPlaceholderStyle,
  selfViewPanelStyle,
  tileHeaderStyle,
  tileHeadingStyle,
  tilePlaceholderStyle,
} from "../page-styles.js";

interface CallPageProps {
  callError: string | null;
  callParticipants: number;
  callSession: StoredCallSession | null;
  callStatus: "idle" | "requesting_token" | "connecting" | "connected";
  connectedSfuUrl: string | null;
  hasLocalVideo: boolean;
  hasRemoteVideo: boolean;
  isCameraEnabled: boolean;
  isHost: boolean;
  isMicEnabled: boolean;
  isRemovingParticipant: string | null;
  isTogglingCamera: boolean;
  isTogglingMic: boolean;
  localVideoRef: RefObject<HTMLVideoElement | null>;
  networkHealth: NetworkHealth;
  participants: RoomParticipant[];
  remoteParticipantLabel: string;
  remoteVideoRef: RefObject<HTMLVideoElement | null>;
  slug: string;
  downgradeRung: DowngradeRung;
  audioOnlyPromptState: PromptState;
  p2pStatus: P2PCallStatus;
  p2pError: string | null;
  chatMessages: ChatMessage[];
  onRemoveParticipant: (targetSessionId: string) => void;
  onSendChat: (body: string) => void;
  onBackToJoin: () => void;
  onLeaveCall: () => void;
  onRestoreQuality: () => void;
  onAcceptAudioOnly: () => void;
  onDismissAudioOnly: () => void;
  onToggleCamera: () => Promise<void>;
  onToggleMicrophone: () => Promise<void>;
}

export function CallPage(props: CallPageProps) {
  const isP2PNegotiating = props.p2pStatus === "negotiating" || props.p2pStatus === "requesting_token";
  const isP2PConnected = props.p2pStatus === "connected";
  const controlsDisabled = (props.callStatus !== "connected" && !isP2PConnected) || isP2PNegotiating;

  return (
    <main style={callPageStyle}>
      <section style={callHeaderStyle}>
        <div>
          <h1>LowTime</h1>
          <p style={mutedParagraphStyle}>Room <code>{props.slug}</code></p>
        </div>
        <div style={callHeaderBadgeRowStyle}>
          <div style={networkBadgeStyle(props.networkHealth)}>
            {getNetworkHealthLabel(props.networkHealth)}
          </div>
          <div style={callStatusBadgeStyle(props.callStatus)}>
            {props.callStatus.replace("_", " ")}
          </div>
        </div>
      </section>
      {isP2PNegotiating ? (
        <section role="status" aria-live="polite" aria-label="Connection transition">
          <p style={mutedParagraphStyle}>
            <strong>Switching to direct connection</strong>
          </p>
        </section>
      ) : null}
      {props.downgradeRung !== "none" ? (
        <section role="status" aria-live="polite">
          <p style={mutedParagraphStyle}>
            <strong>{getRungLabel(props.downgradeRung)}</strong>
          </p>
          <button type="button" onClick={props.onRestoreQuality}>
            Restore video
          </button>
        </section>
      ) : null}
      {props.audioOnlyPromptState === "suggested" ? (
        <section role="dialog" aria-labelledby="audio-only-prompt-heading">
          <h2 id="audio-only-prompt-heading">Network still unstable</h2>
          <p style={mutedParagraphStyle}>
            We had to pause your video because the network kept dropping. Would you like to continue audio-only, or keep retrying video?
          </p>
          <div>
            <button type="button" onClick={props.onAcceptAudioOnly} autoFocus>
              Continue audio-only
            </button>{" "}
            <button type="button" onClick={props.onDismissAudioOnly}>
              Keep trying video
            </button>
          </div>
        </section>
      ) : null}
      {props.callSession ? (
        <section style={callLayoutStyle}>
          <section style={remoteTileStyle}>
            <div style={tileHeaderStyle}>
              <h2 style={tileHeadingStyle}>Remote</h2>
              <span>{props.remoteParticipantLabel}</span>
            </div>
            {props.hasRemoteVideo ? (
              <video
                ref={props.remoteVideoRef}
                autoPlay
                playsInline
                style={remoteVideoStyle}
              />
            ) : (
              <div style={tilePlaceholderStyle}>
                <strong>{props.remoteParticipantLabel}</strong>
                <p style={mutedParagraphStyle}>
                  {props.callStatus === "connected" || isP2PConnected
                    ? "No remote camera is visible yet."
                    : "Connecting the first call experience..."}
                </p>
              </div>
            )}
          </section>
          <aside style={selfViewPanelStyle}>
            <div style={tileHeaderStyle}>
              <h2 style={tileHeadingStyle}>You</h2>
              <span>{props.callSession.displayName}</span>
            </div>
            {props.hasLocalVideo && props.isCameraEnabled ? (
              <video
                ref={props.localVideoRef}
                autoPlay
                muted
                playsInline
                style={localVideoStyle}
              />
            ) : (
              <div style={selfPlaceholderStyle}>
                <strong>{props.callSession.displayName}</strong>
                <p style={mutedParagraphStyle}>
                  {props.isCameraEnabled ? "Camera is preparing..." : "Camera is off."}
                </p>
              </div>
            )}
            <dl style={callFactsStyle}>
              <div>
                <dt>Transport</dt>
                <dd><code>{isP2PConnected ? "p2p" : props.callSession.transportPreference}</code></dd>
              </div>
              <div>
                <dt>Participants</dt>
                <dd>{props.callParticipants}</dd>
              </div>
              <div>
                <dt>Mic</dt>
                <dd>{props.isMicEnabled ? "On" : "Off"}</dd>
              </div>
              <div>
                <dt>Camera</dt>
                <dd>{props.isCameraEnabled ? "On" : "Off"}</dd>
              </div>
            </dl>
            {props.connectedSfuUrl ? (
              <p style={metaTextStyle}>
                SFU <code>{props.connectedSfuUrl}</code>
              </p>
            ) : null}
          </aside>
          <section style={controlsPanelStyle}>
            <button
              type="button"
              onClick={() => void props.onToggleMicrophone()}
              disabled={controlsDisabled || props.isTogglingMic}
              style={secondaryControlStyle}
            >
              {props.isTogglingMic ? "Updating Mic..." : props.isMicEnabled ? "Mute" : "Unmute"}
            </button>
            <button
              type="button"
              onClick={() => void props.onToggleCamera()}
              disabled={controlsDisabled || props.isTogglingCamera}
              style={secondaryControlStyle}
            >
              {props.isTogglingCamera ? "Updating Camera..." : props.isCameraEnabled ? "Turn Camera Off" : "Turn Camera On"}
            </button>
            <button type="button" onClick={props.onLeaveCall} style={dangerControlStyle}>
              Leave Call
            </button>
          </section>
          {props.isHost ? (
            <section style={controlsPanelStyle} aria-label="Host moderation">
              <h3 style={metaTextStyle}>Participants</h3>
              {props.participants.length === 0 ? (
                <p style={mutedParagraphStyle}>No one has joined yet.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.25rem" }}>
                  {props.participants.map((participant) => {
                    const isSelf = participant.id === props.callSession?.sessionId;
                    const isRemoving = props.isRemovingParticipant === participant.id;
                    return (
                      <li key={participant.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span>
                          {participant.displayName}
                          {isSelf ? " (you)" : ""}
                        </span>
                        {isSelf ? null : (
                          <button
                            type="button"
                            onClick={() => props.onRemoveParticipant(participant.id)}
                            disabled={isRemoving}
                            style={dangerControlStyle}
                          >
                            {isRemoving ? "Removing..." : "Remove"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}
          {props.callError ? <p role="alert">{props.callError}</p> : null}
          {props.p2pError && props.p2pStatus === "failed" ? (
            <p role="alert">{props.p2pError}</p>
          ) : null}
          <ChatPanel
            messages={props.chatMessages}
            currentSessionId={props.callSession.sessionId}
            onSend={props.onSendChat}
            disabled={props.callStatus !== "connected" && !isP2PConnected}
          />
        </section>
      ) : (
        <>
          {props.callError ? <p role="alert">{props.callError}</p> : null}
          {props.p2pError && props.p2pStatus === "failed" ? (
            <p role="alert">{props.p2pError}</p>
          ) : null}
          <button type="button" onClick={props.onBackToJoin}>
            Back To Join Screen
          </button>
        </>
      )}
    </main>
  );
}
