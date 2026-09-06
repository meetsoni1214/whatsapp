const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: "always",
});

export function formatLastSeen(lastSeenAt: string, now = Date.now()): string {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - new Date(lastSeenAt).getTime()) / 1000),
  );
  if (elapsedSeconds < 60) return "just now";

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return relativeTimeFormatter.format(-elapsedMinutes, "minute");
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return relativeTimeFormatter.format(-elapsedHours, "hour");
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return relativeTimeFormatter.format(-elapsedDays, "day");
}
