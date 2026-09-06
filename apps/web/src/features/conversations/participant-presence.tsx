import { useEffect, useState } from "react";
import type { PresenceState } from "@event-chat/contracts";
import { cn } from "@/lib/utils";
import { formatLastSeen } from "./presence-time";

export function ParticipantPresence({
  className,
  presence,
}: {
  className?: string;
  presence: PresenceState;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (presence.online || !presence.lastSeenAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [presence.lastSeenAt, presence.online]);

  if (presence.online) {
    return (
      <span className={cn("text-primary", className)} aria-live="polite">
        Online
      </span>
    );
  }

  if (!presence.lastSeenAt) {
    return (
      <span className={cn("text-muted-foreground", className)}>
        Offline
      </span>
    );
  }

  return (
    <span
      className={cn("text-muted-foreground", className)}
      aria-live="polite"
    >
      Last seen{" "}
      <time
        dateTime={presence.lastSeenAt}
        title={new Date(presence.lastSeenAt).toLocaleString()}
      >
        {formatLastSeen(presence.lastSeenAt, now)}
      </time>
    </span>
  );
}
