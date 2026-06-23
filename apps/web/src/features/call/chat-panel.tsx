import { useEffect, useRef, useState } from "react";

import type { ChatMessage } from "@lowtime/shared";

import {
  chatEmptyStyle,
  chatHeaderStyle,
  chatInputRowStyle,
  chatInputStyle,
  chatMessageListStyle,
  chatMessageStyle,
  chatPanelStyle,
  chatSendButtonStyle,
  chatSenderStyle,
} from "./chat-panel.styles.js";

export interface ChatPanelProps {
  messages: ChatMessage[];
  currentSessionId: string;
  onSend: (body: string) => void;
  disabled?: boolean;
}

const CHAT_MAX_BODY_LENGTH = 500;

export function ChatPanel(props: ChatPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    const el = listRef.current;
    if (el != null) {
      el.scrollTop = el.scrollHeight;
    }
  }, [props.messages]);

  function handleSend() {
    const body = inputValue.trim();
    if (body.length === 0 || body.length > CHAT_MAX_BODY_LENGTH || props.disabled) return;
    props.onSend(body);
    setInputValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <section style={chatPanelStyle} aria-label="Chat">
      <div style={chatHeaderStyle}>Chat</div>
      <div ref={listRef} style={chatMessageListStyle} role="log" aria-live="polite" aria-label="Chat messages">
        {props.messages.length === 0 ? (
          <p style={chatEmptyStyle}>No messages yet</p>
        ) : (
          props.messages.map((msg) => {
            const isOwn = msg.senderId === props.currentSessionId;
            return (
              <div key={msg.id} style={chatMessageStyle(isOwn)}>
                {!isOwn && <div style={chatSenderStyle}>{msg.senderName}</div>}
                <div>{msg.body}</div>
              </div>
            );
          })
        )}
      </div>
      <div style={chatInputRowStyle}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          maxLength={CHAT_MAX_BODY_LENGTH}
          disabled={props.disabled}
          style={chatInputStyle}
          aria-label="Chat message input"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={props.disabled || inputValue.trim().length === 0}
          style={chatSendButtonStyle}
          aria-label="Send message"
        >
          Send
        </button>
      </div>
    </section>
  );
}
