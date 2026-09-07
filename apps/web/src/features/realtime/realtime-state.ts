import { createContext, useContext } from "react";
import type { PresenceState } from "@event-chat/contracts";
import type { PendingMessage, RealtimeStatus } from "./realtime-client";

export interface RealtimeContextValue {
  error: string | null;
  pendingMessages: PendingMessage[];
  retryMessage: (clientMessageId: string) => void;
  presenceFor: (userId: string) => PresenceState | undefined;
  sendMessage: (conversationId: string, content: string) => void;
  setTyping: (conversationId: string, isTyping: boolean) => boolean;
  isTyping: (conversationId: string, userId: string) => boolean;
  status: RealtimeStatus;
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtime(): RealtimeContextValue {
  const value = useContext(RealtimeContext);
  if (!value) {
    throw new Error("useRealtime must be used inside RealtimeProvider");
  }
  return value;
}
