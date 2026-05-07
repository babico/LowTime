import type { LobbyRequestStatusResponse } from "@lowtime/shared";

import type { StoredLobbyRequest } from "../../room-entry.js";
import { callFactsStyle, callPageStyle, mutedParagraphStyle, previewCardStyle } from "../page-styles.js";

interface WaitingPageProps {
  slug: string;
  waitingError: string | null;
  waitingRequest: StoredLobbyRequest | null;
  waitingStatus: LobbyRequestStatusResponse | null;
  onBackToJoin: () => void;
}

export function WaitingPage(props: WaitingPageProps) {
  return (
    <main style={callPageStyle}>
      <section style={previewCardStyle}>
        <h1>Waiting For Host Approval</h1>
        <p style={mutedParagraphStyle}>
          Room <code>{props.slug}</code> is using lobby mode. We&apos;ll move you into the call as soon as the host approves your request.
        </p>
        {props.waitingRequest ? (
          <dl style={callFactsStyle}>
            <div>
              <dt>Name</dt>
              <dd>{props.waitingRequest.displayName}</dd>
            </div>
            <div>
              <dt>Preset</dt>
              <dd>{props.waitingRequest.qualityPreset}</dd>
            </div>
            <div>
              <dt>Mic</dt>
              <dd>{props.waitingRequest.requestedMedia.audio ? "On" : "Off"}</dd>
            </div>
            <div>
              <dt>Camera</dt>
              <dd>{props.waitingRequest.requestedMedia.video ? "On" : "Off"}</dd>
            </div>
          </dl>
        ) : null}
        {props.waitingStatus?.status === "waiting" || props.waitingStatus == null ? (
          <p>Approval is still pending.</p>
        ) : null}
        {props.waitingStatus?.status === "denied" ? (
          <p role="alert">
            Host denied this request: <strong>{props.waitingStatus.reason}</strong>
          </p>
        ) : null}
        {props.waitingError ? <p role="alert">{props.waitingError}</p> : null}
        <button type="button" onClick={props.onBackToJoin}>
          Back To Join Screen
        </button>
      </section>
    </main>
  );
}
