import {
  protocolVersion,
  type ServerFrame,
  webSocketCloseCodes,
} from "@event-chat/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RealtimeClient,
  type PendingMessage,
  type RealtimeStatus,
} from "./realtime-client";

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;

  constructor(url: string) {
    super();
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  message(frame: ServerFrame): void {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(frame) }),
    );
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent("close", { code, reason }));
  }
}

const user = {
  id: "426aa224-2ec1-4530-898c-d0c48f8b59c9",
  username: "alice",
};
const conversationId = "1685bc61-ac88-45e7-8437-593219fefb10";
const occurredAt = "2026-08-02T08:00:00.000Z";
const eventId = "30000000-0000-4000-8000-000000000000";

function authenticatedFrame(): ServerFrame {
  return {
    v: protocolVersion,
    type: "auth.authenticated",
    eventId,
    requestId: "20000000-0000-4000-8000-000000000000",
    occurredAt,
    payload: { user },
  };
}

function createHarness() {
  let token = "access-one";
  let latestOutbox: PendingMessage[] = [];
  const statuses: RealtimeStatus[] = [];
  const onFrame = vi.fn();
  const refreshAccessToken = vi.fn(async () => {
    token = "access-two";
    return token;
  });
  const client = new RealtimeClient({
    url: "ws://localhost:3000/ws",
    getAccessToken: () => token,
    refreshAccessToken,
    onAuthenticated: vi.fn(),
    onFrame,
    onOutboxChange: (messages) => {
      latestOutbox = messages;
    },
    onProtocolError: vi.fn(),
    onSessionExpired: vi.fn(),
    onStatusChange: (status) => statuses.push(status),
  });

  return {
    client,
    getOutbox: () => latestOutbox,
    onFrame,
    refreshAccessToken,
    statuses,
  };
}

describe("RealtimeClient", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("authenticates first and reconciles an optimistic message on acceptance", () => {
    const harness = createHarness();
    harness.client.start();

    const socket = FakeWebSocket.instances[0];
    socket.open();
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      type: "auth.authenticate",
      payload: { accessToken: "access-one" },
    });
    socket.message(authenticatedFrame());

    const clientMessageId = harness.client.sendMessage(
      conversationId,
      "hello",
    );
    expect(harness.getOutbox()).toMatchObject([
      { clientMessageId, content: "hello", status: "sending" },
    ]);

    const sendFrame = JSON.parse(socket.sent[1]) as {
      requestId: string;
    };
    const accepted: ServerFrame = {
      v: protocolVersion,
      type: "message.accepted",
      eventId: "40000000-0000-4000-8000-000000000000",
      requestId: sendFrame.requestId,
      occurredAt,
      payload: {
        messageId: "50000000-0000-4000-8000-000000000000",
        clientMessageId,
        conversationId,
        createdAt: occurredAt,
      },
    };
    socket.message(accepted);

    expect(harness.onFrame).toHaveBeenCalledWith(
      accepted,
      expect.objectContaining({ clientMessageId, content: "hello" }),
    );
    expect(harness.getOutbox()).toEqual([]);
    harness.client.stop();
  });

  it("retries an unacknowledged message with the same client ID", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.client.start();
    const first = FakeWebSocket.instances[0];
    first.open();
    first.message(authenticatedFrame());

    const clientMessageId = harness.client.sendMessage(
      conversationId,
      "retry me",
    );
    const firstSend = JSON.parse(first.sent[1]) as {
      payload: { clientMessageId: string };
      requestId: string;
    };

    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(1_000);
    const second = FakeWebSocket.instances[1];
    second.open();
    second.message(authenticatedFrame());

    const retried = JSON.parse(second.sent[1]) as {
      payload: { clientMessageId: string };
      requestId: string;
    };
    expect(retried.payload.clientMessageId).toBe(clientMessageId);
    expect(retried.requestId).toBe(firstSend.requestId);
    harness.client.stop();
  });

  it("refreshes the access token after the server expires the connection", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.client.start();
    const first = FakeWebSocket.instances[0];
    first.open();
    first.message(authenticatedFrame());

    first.close(webSocketCloseCodes.tokenExpired, "expired");
    await vi.runAllTimersAsync();

    expect(harness.refreshAccessToken).toHaveBeenCalledOnce();
    const second = FakeWebSocket.instances[1];
    second.open();
    expect(JSON.parse(second.sent[0])).toMatchObject({
      payload: { accessToken: "access-two" },
    });
    harness.client.stop();
  });
});
