import { useEffect, useRef, useState } from "react";

import type { ChatMessage } from "@lowtime/shared";

export interface ChatPanelProps {
  messages: ChatMessage[];
  currentSessionId: string;
  onSend: (body: string) => void;
  disabled?: boolean;
}

const CHAT_MAX_BODY_LENGTH = 500;

const panelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  border: "1px solid #333",
  borderRadius: "4px",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid #333",
  fontWeight: "bold",
  fontSize: "0.875rem",
};

const messageListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 12px",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  minHeight: 0,
};

const messageStyle = (isOwn: boolean): React.CSSProperties => ({
  maxWidth: "80%",
  alignSelf: isOwn ? "flex-end" : "flex-start",
  background: isOwn ? "#2563eb" : "#374151",
  color: "#fff",
  borderRadius: "8px",
  padding: "6px 10px",
  fontSize: "0.875rem",
  wordBreak: "break-word",
});

const senderStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  opacity: 0.75,
  marginBottom: "2px",
};

const inputRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "6px",
  padding: "8px",
  borderTop: "1px solid #333",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "6px 8px",
  borderRadius: "4px",
  border: "1px solid #555",
  background: "#1f2937",
  color: "#fff",
  fontSize: "0.875rem",
};

const sendButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "4px",
  border: "none",
  background: "#2563eb",
  color: "#fff",
  cursor: "pointer",
  fontSize: "0.875rem",
};

const emptyStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "0.875rem",
  textAlign: "center",
  marginTop: "16px",
};

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
    <section style={panelStyle} aria-label="Chat">
      <div style={headerStyle}>Chat</div>
      <div ref={listRef} style={messageListStyle} role="log" aria-live="polite" aria-label="Chat messages">
        {props.messages.length === 0 ? (
          <p style={emptyStyle}>No messages yet</p>
        ) : (
          props.messages.map((msg) => {
            const isOwn = msg.senderId === props.currentSessionId;
            return (
              <div key={msg.id} style={messageStyle(isOwn)}>
                {!isOwn && <div style={senderStyle}>{msg.senderName}</div>}
                <div>{msg.body}</div>
              </div>
            );
          })
        )}
      </div>
      <div style={inputRowStyle}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          maxLength={CHAT_MAX_BODY_LENGTH}
          disabled={props.disabled}
          style={inputStyle}
          aria-label="Chat message input"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={props.disabled || inputValue.trim().length === 0}
          style={sendButtonStyle}
          aria-label="Send message"
        >
          Send
        </button>
      </div>
    </section>
  );
}
