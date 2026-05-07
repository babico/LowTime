import type { CreateRoomResponse } from "@lowtime/shared";

import {
  installCardStyle,
  installHeadingStyle,
  mutedParagraphStyle,
} from "../page-styles.js";

interface HomePageProps {
  createError: string | null;
  createResult: CreateRoomResponse | null;
  isCreating: boolean;
  isInstallingApp: boolean;
  isStandaloneApp: boolean;
  installMessage: string | null;
  showInstallPrompt: boolean;
  shareUrl: string | null;
  onCopyLink: () => Promise<void>;
  onCreateRoom: () => Promise<void>;
  onInstallApp: () => Promise<void>;
  onOpenRoom: () => void;
}

export function HomePage(props: HomePageProps) {
  return (
    <main>
      <h1>LowTime</h1>
      <p>Create a room fast, share the link, and move directly into the SFU-backed join flow.</p>
      {props.isStandaloneApp || props.showInstallPrompt || props.installMessage ? (
        <section style={installCardStyle}>
          <h2 style={installHeadingStyle}>App Access</h2>
          <p style={mutedParagraphStyle}>
            {props.isStandaloneApp
              ? "LowTime is already installed on this device."
              : props.installMessage ?? "Add LowTime to your home screen for faster repeat joins."}
          </p>
          {!props.isStandaloneApp && props.showInstallPrompt ? (
            <button type="button" onClick={() => void props.onInstallApp()} disabled={props.isInstallingApp}>
              {props.isInstallingApp ? "Opening Install Prompt..." : "Install LowTime"}
            </button>
          ) : null}
        </section>
      ) : null}
      <button type="button" onClick={() => void props.onCreateRoom()} disabled={props.isCreating}>
        {props.isCreating ? "Creating..." : "Start Call"}
      </button>
      {props.createError ? <p role="alert">{props.createError}</p> : null}
      {props.createResult ? (
        <section>
          <h2>Room Ready</h2>
          <p>
            <strong>Share link:</strong>{" "}
            <a href={props.createResult.joinUrl}>{props.shareUrl}</a>
          </p>
          <p>
            <strong>Host secret:</strong> {props.createResult.hostSecret}
          </p>
          <p>Store the host secret locally. It is not included in the room link.</p>
          <button type="button" onClick={() => void props.onCopyLink()}>
            Copy Link
          </button>{" "}
          <button type="button" onClick={props.onOpenRoom}>
            Open Link
          </button>
        </section>
      ) : null}
    </main>
  );
}
