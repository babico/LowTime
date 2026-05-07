import type { AccessMode, CreateRoomResponse } from "@lowtime/shared";

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
  selectedAccessMode: AccessMode;
  passcodeInput: string;
  passcodeError: string | null;
  onAccessModeChange: (mode: AccessMode) => void;
  onPasscodeInputChange: (value: string) => void;
  onCopyLink: () => Promise<void>;
  onCopyPasscode: () => Promise<void>;
  onCreateRoom: () => Promise<void>;
  onInstallApp: () => Promise<void>;
  onOpenRoom: () => void;
}

const PASSCODE_MIN_LENGTH = 4;
const PASSCODE_MAX_LENGTH = 64;

/**
 * Returns `null` when the input is an acceptable passcode and a short message
 * when it is not. Kept local to the home page so the Start Call button can
 * reflect validity synchronously; the server re-validates authoritatively.
 */
export function getPasscodeClientError(input: string): string | null {
  if (input.length === 0) {
    return "Passcode is required for passcode rooms.";
  }
  if (input !== input.trim()) {
    return "Passcode must not start or end with whitespace.";
  }
  if (/\p{Cc}/u.test(input)) {
    return "Passcode must not contain control characters.";
  }
  const codePointLength = [...input].length;
  if (codePointLength < PASSCODE_MIN_LENGTH || codePointLength > PASSCODE_MAX_LENGTH) {
    return `Passcode must be ${PASSCODE_MIN_LENGTH} to ${PASSCODE_MAX_LENGTH} characters.`;
  }
  return null;
}

export function HomePage(props: HomePageProps) {
  const needsPasscodeInput = props.selectedAccessMode === "passcode";
  const passcodeClientError = needsPasscodeInput
    ? getPasscodeClientError(props.passcodeInput)
    : null;
  const submitDisabled =
    props.isCreating || (needsPasscodeInput && passcodeClientError != null);

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
      <section>
        <h2>Room Settings</h2>
        <label>
          Access mode
          <select
            value={props.selectedAccessMode}
            onChange={(event) => props.onAccessModeChange(event.target.value as AccessMode)}
            disabled={props.isCreating}
          >
            <option value="open">Open (anyone with the link)</option>
            <option value="lobby">Lobby (host approves each join)</option>
            <option value="passcode">Passcode (guests must enter a passcode)</option>
          </select>
        </label>
        {needsPasscodeInput ? (
          <label>
            Room passcode
            <input
              type="password"
              value={props.passcodeInput}
              onChange={(event) => props.onPasscodeInputChange(event.target.value)}
              placeholder={`${PASSCODE_MIN_LENGTH}-${PASSCODE_MAX_LENGTH} characters`}
              aria-describedby="home-passcode-hint"
              disabled={props.isCreating}
            />
          </label>
        ) : null}
        {needsPasscodeInput && passcodeClientError != null ? (
          <p id="home-passcode-hint" role="alert">
            {passcodeClientError}
          </p>
        ) : null}
        {needsPasscodeInput && props.passcodeError != null ? (
          <p role="alert">{props.passcodeError}</p>
        ) : null}
      </section>
      <button type="button" onClick={() => void props.onCreateRoom()} disabled={submitDisabled}>
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
          {props.createResult.passcode ? (
            <>
              <p>
                <strong>Passcode:</strong>{" "}
                <code>{props.createResult.passcode}</code>
              </p>
              <p style={mutedParagraphStyle}>
                Share the passcode through a different channel than the link. LowTime only shows it once.
              </p>
              <button type="button" onClick={() => void props.onCopyPasscode()}>
                Copy Passcode
              </button>{" "}
            </>
          ) : null}
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
