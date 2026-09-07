import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  AuthenticatedSession,
  TypingUpdatedFrame,
} from "@event-chat/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeClient } from "./realtime-client";
import { RealtimeProvider } from "./realtime-context";
import { useRealtime } from "./realtime-state";

type Options = ConstructorParameters<typeof RealtimeClient>[0];
const mock = vi.hoisted(() => ({
  options: null as Options | null,
  stop: vi.fn(),
  setTyping: vi.fn(() => true),
}));
vi.mock("./realtime-client", () => ({
  getRealtimeUrl: () => "ws://localhost/ws",
  RealtimeClient: class {
    constructor(options: Options) {
      mock.options = options;
    }
    start() {
      mock.options!.onStatusChange("live");
    }
    stop = mock.stop;
    setTyping = mock.setTyping;
  },
}));
vi.mock("./realtime-cache", () => ({
  recoverRealtimeQueries: vi.fn(),
  upsertRealtimeMessage: vi.fn(),
}));

const session: AuthenticatedSession = {
  accessToken: "token",
  user: { id: "alice", username: "alice" },
};
const frame: TypingUpdatedFrame = {
  v: 1,
  type: "typing.updated",
  eventId: "event",
  occurredAt: "2026-09-06T00:00:00.000Z",
  payload: { conversationId: "chat", userId: "bob", isTyping: true },
};

function mount() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider session={session}>{children}</RealtimeProvider>
    </QueryClientProvider>
  );
  return renderHook(useRealtime, { wrapper });
}

describe("RealtimeProvider typing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mock.stop.mockClear();
    mock.setTyping.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("receives scoped hints, keeps sending stable, and clears on connection loss without replay", () => {
    const { result, unmount } = mount();
    const send = result.current.setTyping;
    act(() => mock.options!.onFrame(frame));
    expect(result.current.isTyping("chat", "bob")).toBe(true);
    expect(result.current.isTyping("other", "bob")).toBe(false);
    expect(result.current.setTyping).toBe(send);
    act(() =>
      mock.options!.onFrame({
        ...frame,
        payload: { ...frame.payload, userId: "alice" },
      }),
    );
    expect(result.current.isTyping("chat", "alice")).toBe(false);
    act(() => mock.options!.onStatusChange("reconnecting"));
    expect(result.current.isTyping("chat", "bob")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      mock.options!.onStatusChange("live");
      mock.options!.onAuthenticated(true);
    });
    expect(result.current.isTyping("chat", "bob")).toBe(false);
    expect(mock.setTyping).not.toHaveBeenCalled();
    unmount();
    expect(mock.stop).toHaveBeenCalledOnce();
  });

  it("honors same-timestamp transitions, expires state, and cancels leases on logout/unmount", () => {
    const { result, unmount } = mount();
    act(() => mock.options!.onFrame(frame));
    act(() =>
      mock.options!.onFrame({
        ...frame,
        payload: { ...frame.payload, isTyping: false },
      }),
    );
    expect(result.current.isTyping("chat", "bob")).toBe(false);
    act(() => mock.options!.onFrame(frame));
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.isTyping("chat", "bob")).toBe(false);
    act(() => mock.options!.onFrame(frame));
    act(() => mock.options!.onSessionExpired());
    expect(result.current.isTyping("chat", "bob")).toBe(false);
    act(() => mock.options!.onFrame(frame));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
