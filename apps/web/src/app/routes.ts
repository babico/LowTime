import { getCallRoute, getViewState, getWaitingRoute, type ViewState } from "../room-entry.js";

export function readViewState(location: Pick<Location, "pathname">): ViewState {
  return getViewState(location.pathname);
}

export function getRoomRoute(slug: string): string {
  return `/r/${slug}`;
}

export function getCallPageRoute(slug: string): string {
  return getCallRoute(slug);
}

export function getWaitingPageRoute(slug: string, requestId: string): string {
  return getWaitingRoute(slug, requestId);
}

export function pushRoute(
  history: Pick<History, "pushState">,
  location: Pick<Location, "pathname">,
  path: string,
  setViewState: (viewState: ViewState) => void,
) {
  history.pushState({}, "", path);
  setViewState(readViewState(location));
}

export function toAbsoluteJoinUrl(joinUrl: string, location: Pick<Location, "origin">): string {
  return new URL(joinUrl, location.origin).toString();
}
