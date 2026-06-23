import type { CSSProperties } from "react";

export const chatPanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  border: "1px solid #333",
  borderRadius: "4px",
  overflow: "hidden",
};

export const chatHeaderStyle: CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid #333",
  fontWeight: "bold",
  fontSize: "0.875rem",
};

export const chatMessageListStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 12px",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  minHeight: 0,
};

export const chatMessageStyle = (isOwn: boolean): CSSProperties => ({
  maxWidth: "80%",
  alignSelf: isOwn ? "flex-end" : "flex-start",
  background: isOwn ? "#2563eb" : "#374151",
  color: "#fff",
  borderRadius: "8px",
  padding: "6px 10px",
  fontSize: "0.875rem",
  wordBreak: "break-word",
});

export const chatSenderStyle: CSSProperties = {
  fontSize: "0.75rem",
  opacity: 0.75,
  marginBottom: "2px",
};

export const chatInputRowStyle: CSSProperties = {
  display: "flex",
  gap: "6px",
  padding: "8px",
  borderTop: "1px solid #333",
};

export const chatInputStyle: CSSProperties = {
  flex: 1,
  padding: "6px 8px",
  borderRadius: "4px",
  border: "1px solid #555",
  background: "#1f2937",
  color: "#fff",
  fontSize: "0.875rem",
};

export const chatSendButtonStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: "4px",
  border: "none",
  background: "#2563eb",
  color: "#fff",
  cursor: "pointer",
  fontSize: "0.875rem",
};

export const chatEmptyStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: "0.875rem",
  textAlign: "center",
  marginTop: "16px",
};
