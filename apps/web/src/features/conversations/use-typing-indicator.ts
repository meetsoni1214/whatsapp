import { useCallback, useEffect, useRef } from "react";
import { typingTiming } from "@event-chat/contracts";
import type { RealtimeStatus } from "../realtime/realtime-client";

type SendTyping = (conversationId: string, isTyping: boolean) => boolean;

export function useTypingIndicator(
  conversationId: string,
  status: RealtimeStatus,
  sendTyping: SendTyping,
) {
  const active = useRef(false);
  const lastSentAt = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const stop = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = undefined;
    if (active.current) sendTyping(conversationId, false);
    active.current = false;
    lastSentAt.current = 0;
  }, [conversationId, sendTyping]);

  const onDraftChange = useCallback(
    (draft: string) => {
      if (status !== "live" || document.hidden || !draft.trim()) {
        stop();
        return;
      }
      const now = performance.now();
      if (
        !active.current ||
        now - lastSentAt.current >= typingTiming.refreshMs
      ) {
        if (sendTyping(conversationId, true)) {
          active.current = true;
          lastSentAt.current = now;
        }
      }
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(stop, typingTiming.idleMs);
    },
    [conversationId, status, sendTyping, stop],
  );

  useEffect(() => {
    if (status !== "live") stop();
    return stop;
  }, [status, stop]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [stop]);

  return { onDraftChange, stop };
}
