import type { ComponentProps } from "react";

import { CallPage } from "../features/call/call-page.js";
import { HomePage } from "../features/home/home-page.js";
import { RoomPage } from "../features/room/room-page.js";
import { WaitingPage } from "../features/waiting/waiting-page.js";
import type { ViewState } from "../room-entry.js";

interface AppShellProps {
  callPageProps: Omit<ComponentProps<typeof CallPage>, "onBackToJoin">;
  homePageProps: ComponentProps<typeof HomePage>;
  onBackToJoinFromCall: () => void;
  onBackToJoinFromWaiting: () => void;
  roomPageProps: ComponentProps<typeof RoomPage>;
  viewState: ViewState;
  waitingPageProps: Omit<ComponentProps<typeof WaitingPage>, "onBackToJoin">;
}

export function AppShell(props: AppShellProps) {
  if (props.viewState.kind === "call") {
    return <CallPage {...props.callPageProps} onBackToJoin={props.onBackToJoinFromCall} />;
  }

  if (props.viewState.kind === "waiting") {
    return <WaitingPage {...props.waitingPageProps} onBackToJoin={props.onBackToJoinFromWaiting} />;
  }

  if (props.viewState.kind === "room") {
    return <RoomPage {...props.roomPageProps} />;
  }

  return <HomePage {...props.homePageProps} />;
}
