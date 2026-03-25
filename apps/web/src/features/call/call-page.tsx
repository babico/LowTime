import type { RefObject } from "react";

import type { StoredCallSession } from "../../room-entry.js";
import type { NetworkHealth } from "../../network-health.js";
import { getNetworkHealthLabel } from "../../network-health.js";
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
  isMicEnabled: boolean;
  isTogglingCamera: boolean;
  isTogglingMic: boolean;
  localVideoRef: RefObject<HTMLVideoElement | null>;
  networkHealth: NetworkHealth;
  remoteParticipantLabel: string;
  remoteVideoRef: RefObject<HTMLVideoElement | null>;
  slug: string;
  onBackToJoin: () => void;
  onLeaveCall: () => void;
  onToggleCamera: () => Promise<void>;
  onToggleMicrophone: () => Promise<void>;
}

export function CallPage(props: CallPageProps) {
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
                  {props.callStatus === "connected"
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
                <dd><code>{props.callSession.transportPreference}</code></dd>
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
              disabled={props.callStatus !== "connected" || props.isTogglingMic}
              style={secondaryControlStyle}
            >
              {props.isTogglingMic ? "Updating Mic..." : props.isMicEnabled ? "Mute" : "Unmute"}
            </button>
            <button
              type="button"
              onClick={() => void props.onToggleCamera()}
              disabled={props.callStatus !== "connected" || props.isTogglingCamera}
              style={secondaryControlStyle}
            >
              {props.isTogglingCamera ? "Updating Camera..." : props.isCameraEnabled ? "Turn Camera Off" : "Turn Camera On"}
            </button>
            <button type="button" onClick={props.onLeaveCall} style={dangerControlStyle}>
              Leave Call
            </button>
          </section>
          {props.callError ? <p role="alert">{props.callError}</p> : null}
        </section>
      ) : (
        <>
          {props.callError ? <p role="alert">{props.callError}</p> : null}
          <button type="button" onClick={props.onBackToJoin}>
            Back To Join Screen
          </button>
        </>
      )}
    </main>
  );
}
