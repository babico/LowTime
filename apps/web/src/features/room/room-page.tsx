import type { RefObject } from "react";

import type { JoinRoomResponse, LobbyRequestSummary, QualityPreset, RoomSummary } from "@lowtime/shared";

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
  displayName: string;
  hostLobbyError: string | null;
  hostLobbyRequests: LobbyRequestSummary[];
  hostSecret: string | null;
  isJoining: boolean;
  isLoadingRoom: boolean;
  joinError: string | null;
  joinResult: JoinRoomResponse | null;
  previewAudioEnabled: boolean;
  previewError: string | null;
  previewState: PreviewState;
  previewVideoEnabled: boolean;
  previewVideoRef: RefObject<HTMLVideoElement | null>;
  roomError: string | null;
  roomSummary: RoomSummary | null;
  selectedQualityPreset: QualityPreset;
  slug: string;
  onDisplayNameChange: (value: string) => void;
  onHostLobbyAction: (requestId: string, action: "approve" | "deny") => Promise<void>;
  onJoinRoom: () => Promise<void>;
  onPreviewAudioChange: (checked: boolean) => void;
  onPreviewVideoChange: (checked: boolean) => void;
  onQualityPresetChange: (value: QualityPreset) => void;
  onStartPreview: () => Promise<void>;
}

export function RoomPage(props: RoomPageProps) {
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
                      value={props.selectedQualityPreset}
                      onChange={(event) => props.onQualityPresetChange(event.target.value as QualityPreset)}
                    >
                      <option value="data_saver">Data Saver</option>
                      <option value="balanced">Balanced</option>
                      <option value="best_quality">Best Quality</option>
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
            <div>
              <button type="button" onClick={() => void props.onJoinRoom()} disabled={props.isJoining}>
                {props.isJoining ? "Joining..." : "Join Room"}
              </button>
            </div>
            {props.joinError ? <p role="alert">{props.joinError}</p> : null}
            {props.joinResult?.joinState === "waiting" ? (
              <p>
                Waiting for host approval. Request <code>{props.joinResult.requestId}</code> is queued.
              </p>
            ) : null}
            {props.joinResult?.joinState === "denied" ? (
              <p>
                Join denied: <strong>{props.joinResult.reason}</strong>
              </p>
            ) : null}
          </section>
          {props.roomSummary.accessMode === "lobby" && props.hostSecret ? (
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
        </>
      ) : null}
    </main>
  );
}
