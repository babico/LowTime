/**
 * Host moderation helpers for the web client.
 *
 * Pure wrappers around the room moderation HTTP endpoint so feature
 * modules can stay presentational and unit tests can lock the request
 * shape without spinning the global `fetch`.
 */

export type RemoveParticipantResult =
  | { ok: true; removedSessionId: string }
  | { ok: false; message: string };

export interface RemoveParticipantRequestInput {
  apiBaseUrl: string;
  slug: string;
  sessionId: string;
  hostSecret: string;
  fetcher?: typeof fetch;
}

export async function removeParticipantRequest(
  input: RemoveParticipantRequestInput,
): Promise<RemoveParticipantResult> {
  if (input.hostSecret.trim() === "") {
    return { ok: false, message: "Host secret is required to remove a participant." };
  }

  const f = input.fetcher ?? fetch;
  const url = `${input.apiBaseUrl.replace(/\/$/, "")}/api/rooms/${encodeURIComponent(input.slug)}/participants/${encodeURIComponent(input.sessionId)}/remove`;

  let response: Response;
  try {
    response = await f(url, {
      method: "POST",
      headers: {
        "x-host-secret": input.hostSecret,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error while removing participant";
    return { ok: false, message: `Network error: ${message}` };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.ok) {
    const removedSessionId =
      body != null && typeof body === "object" && "removedSessionId" in body && typeof (body as { removedSessionId: unknown }).removedSessionId === "string"
        ? (body as { removedSessionId: string }).removedSessionId
        : input.sessionId;
    return { ok: true, removedSessionId };
  }

  const message =
    body != null && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
      ? (body as { message: string }).message
      : `Server returned ${response.status}`;

  return { ok: false, message };
}
