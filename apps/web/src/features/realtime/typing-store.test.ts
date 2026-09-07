import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypingStore, typingKey } from "./typing-store";

describe("TypingStore", () => {
  let store: TypingStore;
  const update = { conversationId: "chat", userId: "alice", isTyping: true };
  beforeEach(() => {
    vi.useFakeTimers();
    store = new TypingStore();
  });
  afterEach(() => {
    store.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("refreshes expiry without changing the visible snapshot or accepting an old timer", () => {
    const timers = vi.spyOn(globalThis, "setTimeout");
    store.update(update);
    const oldExpiry = timers.mock.calls[0][0];
    const snapshot = store.getSnapshot();
    vi.advanceTimersByTime(4_000);
    store.update(update);
    if (typeof oldExpiry === "function") {
      oldExpiry();
    }
    vi.advanceTimersByTime(1_000);
    expect(store.getSnapshot()).toBe(snapshot);
    vi.advanceTimersByTime(4_000);
    expect(store.getSnapshot().size).toBe(0);
  });

  it("isolates conversations and users and stops only the named hint", () => {
    store.update(update);
    store.update({ ...update, conversationId: "other" });
    store.update({ ...update, userId: "bob" });
    store.update({ ...update, isTyping: false });
    expect([...store.getSnapshot()]).toEqual([
      typingKey("other", "alice"),
      typingKey("chat", "bob"),
    ]);
    expect(vi.getTimerCount()).toBe(2);
  });

  it("prunes overdue hints after suspension even before their callbacks run", () => {
    store.update(update);
    vi.spyOn(performance, "now").mockReturnValue(6_000);
    store.prune();
    expect(store.getSnapshot().size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears state and timers and removes subscriptions", () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.update(update);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    store.clear();
    vi.advanceTimersByTime(6_000);
    expect(listener).toHaveBeenCalledOnce();
    expect(store.getSnapshot().size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
