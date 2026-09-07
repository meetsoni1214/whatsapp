import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealtimeStatus } from "../realtime/realtime-client";
import { useTypingIndicator } from "./use-typing-indicator";

describe("useTypingIndicator", () => {
  const send = vi.fn(() => true);
  beforeEach(() => {
    vi.useFakeTimers();
    send.mockReset();
    send.mockReturnValue(true);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  function mount() {
    return renderHook(
      ({ chat, status }) => useTypingIndicator(chat, status, send),
      {
        initialProps: { chat: "chat", status: "live" as RealtimeStatus },
        wrapper: StrictMode,
      },
    );
  }

  it("starts immediately, throttles refreshes, and stops three seconds after the last edit", () => {
    const { result, unmount } = mount();
    act(() => result.current.onDraftChange("h"));
    act(() => {
      vi.advanceTimersByTime(1_000);
      result.current.onDraftChange("he");
    });
    expect(send).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1_000);
      result.current.onDraftChange("hel");
    });
    expect(send).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(2_999));
    expect(send).toHaveBeenLastCalledWith("chat", true);
    act(() => vi.advanceTimersByTime(1));
    expect(send).toHaveBeenLastCalledWith("chat", false);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops on clear, explicit stop, conversation change, hiding, and unmount", () => {
    const { result, rerender, unmount } = mount();
    act(() => {
      result.current.onDraftChange("a");
      result.current.onDraftChange("  ");
    });
    expect(send.mock.calls).toEqual([
      ["chat", true],
      ["chat", false],
    ]);
    act(() => {
      result.current.onDraftChange("a");
      result.current.stop();
      result.current.stop();
    });
    expect(send).toHaveBeenCalledTimes(4);
    act(() => result.current.onDraftChange("a"));
    rerender({ chat: "other", status: "live" });
    expect(send).toHaveBeenLastCalledWith("chat", false);
    act(() => result.current.onDraftChange("b"));
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(send).toHaveBeenLastCalledWith("other", false);
    const count = send.mock.calls.length;
    act(() => result.current.onDraftChange("hidden edit"));
    expect(send).toHaveBeenCalledTimes(count);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(send).toHaveBeenCalledTimes(count);
    act(() => result.current.onDraftChange("c"));
    unmount();
    expect(send).toHaveBeenLastCalledWith("other", false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("requires fresh input after reconnect and immediately retries a new burst after a failed send", () => {
    const { result, rerender, unmount } = mount();
    send.mockReturnValueOnce(false);
    act(() => {
      result.current.onDraftChange("a");
      result.current.onDraftChange("ab");
    });
    expect(send).toHaveBeenCalledTimes(2);
    rerender({ chat: "chat", status: "offline" });
    const count = send.mock.calls.length;
    act(() => result.current.onDraftChange("offline"));
    rerender({ chat: "chat", status: "live" });
    expect(send).toHaveBeenCalledTimes(count);
    act(() => result.current.onDraftChange("fresh"));
    expect(send).toHaveBeenLastCalledWith("chat", true);
    expect(send).toHaveBeenCalledTimes(count + 1);
    unmount();
  });
});
