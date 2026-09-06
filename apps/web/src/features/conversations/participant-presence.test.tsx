import { describe, expect, it } from "vitest";
import { formatLastSeen } from "./presence-time";

describe("formatLastSeen", () => {
  const now = new Date("2026-08-02T12:00:00.000Z").getTime();

  it("uses readable units as time passes", () => {
    expect(formatLastSeen("2026-08-02T11:59:40.000Z", now)).toBe("just now");
    expect(formatLastSeen("2026-08-02T11:55:00.000Z", now)).toBe(
      "5 minutes ago",
    );
    expect(formatLastSeen("2026-08-02T09:00:00.000Z", now)).toBe(
      "3 hours ago",
    );
    expect(formatLastSeen("2026-07-30T12:00:00.000Z", now)).toBe("3 days ago");
  });
});
