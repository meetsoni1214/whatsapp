import {
  useCallback,
  useSyncExternalStore,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AuthenticatedSession,
  Message,
  PresenceState,
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

import { TypingStore, typingKey } from "./typing-store";

interface TimedPresence {
  occurredAt: string;
  state: PresenceState;
}

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
  const [presenceOverrides, setPresenceOverrides] = useState<
    Record<string, TimedPresence>
  >({});
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [typingStore] = useState(() => new TypingStore());
  const typingSnapshot = useSyncExternalStore(
    typingStore.subscribe,
    typingStore.getSnapshot,
  );
  const setTyping = useCallback(
    (conversationId: string, isTyping: boolean) =>
      clientRef.current?.setTyping(conversationId, isTyping) ?? false,
    [],
  );

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

      if (frame.type === "typing.updated") {
        if (frame.payload.userId !== session.user.id)
          typingStore.update(frame.payload);
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

      if (frame.type === "presence.updated") {
        setPresenceOverrides((current) => {
          const previous = current[frame.payload.userId];
          if (previous && previous.occurredAt >= frame.occurredAt) {
            return current;
          }
          return {
            ...current,
            [frame.payload.userId]: {
              occurredAt: frame.occurredAt,
              state: frame.payload,
            },
          };
        });
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
        if (reconnected) {
          setPresenceOverrides({});
          recoverRealtimeQueries(queryClient);
        }
      },
      onFrame: handleFrame,
      onOutboxChange: setPendingMessages,
      onProtocolError: setError,
      onSessionExpired: () => {
        typingStore.clear();
        queryClient.setQueryData(queryKeys.session, null);
        queryClient.removeQueries({ queryKey: queryKeys.conversations.all });
      },
      onStatusChange: (nextStatus) => {
        if (nextStatus !== "live") typingStore.clear();
        setStatus(nextStatus);
      },
    });
    clientRef.current = client;
    client.start();
    const pruneTyping = () => {
      if (!document.hidden) typingStore.prune();
    };
    document.addEventListener("visibilitychange", pruneTyping);

    return () => {
      document.removeEventListener("visibilitychange", pruneTyping);
      typingStore.clear();
      client.stop();
      clientRef.current = null;
    };
  }, [queryClient, session.user.id, typingStore]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      error,
      pendingMessages,
      status,
      setTyping,
      isTyping: (conversationId, userId) =>
        typingSnapshot.has(typingKey(conversationId, userId)),
      presenceFor: (userId) => presenceOverrides[userId]?.state,
      retryMessage: (clientMessageId) =>
        clientRef.current?.retryMessage(clientMessageId),
      sendMessage: (conversationId, content) => {
        const trimmed = content.trim();
        if (!trimmed) return;
        setError(null);
        clientRef.current?.sendMessage(conversationId, trimmed);
      },
    }),
    [
      error,
      pendingMessages,
      presenceOverrides,
      status,
      setTyping,
      typingSnapshot,
    ],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}
