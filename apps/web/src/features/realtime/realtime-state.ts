import { createContext, useContext } from "react";
import type { PendingMessage, RealtimeStatus } from "./realtime-client";

export interface RealtimeContextValue {
  error: string | null;
  pendingMessages: PendingMessage[];
  retryMessage: (clientMessageId: string) => void;
  sendMessage: (conversationId: string, content: string) => void;
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
