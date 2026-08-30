import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AuthenticatedSession,
  Message,
  ServerFrame,
} from "@event-chat/contracts";
import { restoreSession } from "@/api";
import { queryKeys } from "@/lib/query-keys";
import {
  getRealtimeUrl,
  RealtimeClient,
  type PendingMessage,
  type RealtimeStatus,
} from "./realtime-client";
import {
  recoverRealtimeQueries,
  upsertRealtimeMessage,
} from "./realtime-cache";

import { RealtimeContext, type RealtimeContextValue } from "./realtime-state";
export function RealtimeProvider({
  children,
  session,
}: {
  children: ReactNode;
  session: AuthenticatedSession;
}) {
  const queryClient = useQueryClient();
  const tokenRef = useRef(session.accessToken);
  const clientRef = useRef<RealtimeClient | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tokenRef.current = session.accessToken;
  }, [session.accessToken]);

  useEffect(() => {
    const handleFrame = (
      frame: ServerFrame,
      pending?: PendingMessage,
    ): void => {
      if (frame.type === "error") {
        setError(frame.payload.message);
        return;
      }

      let message: Message | undefined;
      if (frame.type === "message.created") {
        message = {
          id: frame.payload.messageId,
          conversationId: frame.payload.conversationId,
          senderId: frame.payload.senderId,
          clientMessageId: frame.payload.clientMessageId,
          content: frame.payload.content,
          createdAt: frame.payload.createdAt,
        };
      } else if (frame.type === "message.accepted" && pending) {
        message = {
          id: frame.payload.messageId,
          conversationId: frame.payload.conversationId,
          senderId: session.user.id,
          clientMessageId: frame.payload.clientMessageId,
          content: pending.content,
          createdAt: frame.payload.createdAt,
        };
      }

      if (message) {
        setError(null);
        upsertRealtimeMessage(queryClient, message);
      }
    };

    const client = new RealtimeClient({
      url: getRealtimeUrl(),
      getAccessToken: () => tokenRef.current,
      refreshAccessToken: async () => {
        const refreshed = await restoreSession();
        tokenRef.current = refreshed.accessToken;
        queryClient.setQueryData(queryKeys.session, refreshed);
        return refreshed.accessToken;
      },
      onAuthenticated: (reconnected) => {
        setError(null);
        if (reconnected) recoverRealtimeQueries(queryClient);
      },
      onFrame: handleFrame,
      onOutboxChange: setPendingMessages,
      onProtocolError: setError,
      onSessionExpired: () => {
        queryClient.setQueryData(queryKeys.session, null);
        queryClient.removeQueries({ queryKey: queryKeys.conversations.all });
      },
      onStatusChange: setStatus,
    });
    clientRef.current = client;
    client.start();

    return () => {
      client.stop();
      clientRef.current = null;
    };
  }, [queryClient, session.user.id]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      error,
      pendingMessages,
      status,
      retryMessage: (clientMessageId) =>
        clientRef.current?.retryMessage(clientMessageId),
      sendMessage: (conversationId, content) => {
        const trimmed = content.trim();
        if (!trimmed) return;
        setError(null);
        clientRef.current?.sendMessage(conversationId, trimmed);
      },
    }),
    [error, pendingMessages, status],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}
