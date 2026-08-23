import {
  protocolVersion,
  serverFrameSchema,
  webSocketCloseCodes,
  type SendMessageFrame,
  type ServerFrame,
} from "@event-chat/contracts";

export type RealtimeStatus =
  | "connecting"
  | "authenticating"
  | "live"
  | "reconnecting"
  | "offline";

export interface PendingMessage {
  clientMessageId: string;
  content: string;
  conversationId: string;
  createdAt: string;
  error?: string;
  requestId: string;
  status: "queued" | "sending" | "failed";
}

interface RealtimeClientOptions {
  getAccessToken: () => string;
  onAuthenticated: (reconnected: boolean) => void;
  onFrame: (frame: ServerFrame, pending?: PendingMessage) => void;
  onOutboxChange: (messages: PendingMessage[]) => void;
  onProtocolError: (message: string) => void;
  onSessionExpired: () => void;
  onStatusChange: (status: RealtimeStatus) => void;
  refreshAccessToken: () => Promise<string>;
  url: string;
  webSocketFactory?: (url: string) => WebSocket;
}

const ACK_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export class RealtimeClient {
  private readonly options: RealtimeClientOptions;
  private readonly outbox = new Map<string, PendingMessage>();
  private reconnectAttempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private refreshPromise?: Promise<void>;
  private socket?: WebSocket;
  private stopped = true;
  private authenticated = false;
  private authenticationRejected = false;
  private hasAuthenticated = false;

  constructor(options: RealtimeClientOptions) {
    this.options = options;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.authenticated = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    for (const message of this.outbox.values()) this.clearAckTimer(message);
    this.socket?.close(1000, "Client stopped");
    this.socket = undefined;
  }

  sendMessage(conversationId: string, content: string): string {
    const clientMessageId = crypto.randomUUID();
    const message: PendingMessage = {
      clientMessageId,
      content,
      conversationId,
      createdAt: new Date().toISOString(),
      requestId: crypto.randomUUID(),
      status: "queued",
    };
    this.outbox.set(clientMessageId, message);
    this.emitOutbox();
    this.sendPending(message);
    return clientMessageId;
  }

  retryMessage(clientMessageId: string): void {
    const message = this.outbox.get(clientMessageId);
    if (!message) return;

    message.error = undefined;
    message.requestId = crypto.randomUUID();
    message.status = "queued";
    this.emitOutbox();
    this.sendPending(message);
  }

  pendingMessage(clientMessageId: string): PendingMessage | undefined {
    const message = this.outbox.get(clientMessageId);
    return message ? { ...message } : undefined;
  }

  private connect(): void {
    if (this.stopped || this.socket) return;
    if (!navigator.onLine) {
      this.options.onStatusChange("offline"); // Checked by Browser whether user is online or not
      return;
    }

    this.options.onStatusChange(
      this.reconnectAttempt === 0 ? "connecting" : "reconnecting",
    );
    const socket =
      this.options.webSocketFactory?.(this.options.url) ??
      new WebSocket(this.options.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.options.onStatusChange("authenticating");
      socket.send(
        JSON.stringify({
          v: protocolVersion,
          type: "auth.authenticate",
          requestId: crypto.randomUUID(),
          payload: { accessToken: this.options.getAccessToken() },
        }),
      );
    });
    socket.addEventListener("message", (event) => this.handleMessage(event));
    socket.addEventListener("close", (event) => this.handleClose(event));
    socket.addEventListener("error", () => {
      if (!this.authenticated) {
        this.options.onProtocolError(
          "The live connection could not be opened.",
        );
      }
    });
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data !== "string") {
      this.options.onProtocolError("The server returned a non-text frame.");
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(event.data) as unknown;
    } catch {
      this.options.onProtocolError("The server returned invalid JSON.");
      return;
    }

    const parsed = serverFrameSchema.safeParse(value);
    if (!parsed.success) {
      this.options.onProtocolError("The server returned an invalid frame.");
      return;
    }

    const frame = parsed.data;
    if (frame.type === "auth.authenticated") {
      const reconnected = this.hasAuthenticated;
      this.hasAuthenticated = true;
      this.authenticated = true;
      this.authenticationRejected = false;
      this.reconnectAttempt = 0;
      this.options.onStatusChange("live");
      this.options.onAuthenticated(reconnected);
      this.flushOutbox();
      return;
    }

    const pending = this.findPending(frame);
    this.options.onFrame(frame, pending ? { ...pending } : undefined);

    if (frame.type === "message.accepted" || frame.type === "message.created") {
      this.removePending(frame.payload.clientMessageId);
      return;
    }

    if (frame.type === "error") {
      if (
        !this.authenticated &&
        frame.payload.code === "AUTHENTICATION_REQUIRED"
      ) {
        this.authenticationRejected = true;
      }
      if (pending) {
        this.clearAckTimer(pending);
        pending.status = "failed";
        pending.error = frame.payload.message;
        this.emitOutbox();
      }
    }
  }

  private handleClose(event: CloseEvent): void {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) return;
    this.socket = undefined;
    this.authenticated = false;
    this.requeueSendingMessages();

    if (this.stopped) return;

    const refresh =
      event.code === webSocketCloseCodes.tokenExpired ||
      this.authenticationRejected;
    this.authenticationRejected = false;
    if (!navigator.onLine) {
      this.options.onStatusChange("offline");
      return;
    }

    this.options.onStatusChange("reconnecting");
    if (refresh) {
      this.refreshAndReconnect();
    } else {
      this.scheduleReconnect();
    }
  }

  private refreshAndReconnect(): void {
    if (this.refreshPromise) return;

    this.refreshPromise = this.options
      .refreshAccessToken()
      .then(() => {
        this.reconnectAttempt = 0;
        this.scheduleReconnect(0);
      })
      .catch(() => {
        this.stopped = true;
        this.options.onSessionExpired();
      })
      .finally(() => {
        this.refreshPromise = undefined;
      });
  }

  private scheduleReconnect(forcedDelay?: number): void {
    if (this.stopped || this.reconnectTimer) return;

    const exponential = Math.min(
      1_000 * 2 ** this.reconnectAttempt,
      MAX_RECONNECT_DELAY_MS,
    );
    const jitter = exponential * Math.random() * 0.2;
    const delay = forcedDelay ?? exponential + jitter;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  private sendPending(message: PendingMessage): void {
    if (
      !this.authenticated ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN ||
      message.status === "failed"
    ) {
      return;
    }

    const frame: SendMessageFrame = {
      v: protocolVersion,
      type: "message.send",
      requestId: message.requestId,
      payload: {
        conversationId: message.conversationId,
        clientMessageId: message.clientMessageId,
        content: message.content,
      },
    };
    message.status = "sending";
    this.emitOutbox();

    try {
      this.socket.send(JSON.stringify(frame));
      const ackTimer = setTimeout(() => {
        message.status = "queued";
        this.emitOutbox();
        this.socket?.close(4000, "Acknowledgement timeout");
      }, ACK_TIMEOUT_MS);
      Object.defineProperty(message, "ackTimer", {
        configurable: true,
        enumerable: false,
        value: ackTimer,
        writable: true,
      });
    } catch {
      message.status = "queued";
      this.emitOutbox();
      this.socket.close(4000, "Send failed");
    }
  }

  private flushOutbox(): void {
    for (const message of this.outbox.values()) {
      if (message.status !== "failed") this.sendPending(message);
    }
  }

  private findPending(frame: ServerFrame): PendingMessage | undefined {
    if (frame.type === "message.accepted" || frame.type === "message.created") {
      return this.outbox.get(frame.payload.clientMessageId);
    }
    if (frame.type === "error" && frame.requestId) {
      return [...this.outbox.values()].find(
        (message) => message.requestId === frame.requestId,
      );
    }
    return undefined;
  }

  private removePending(clientMessageId: string): void {
    const message = this.outbox.get(clientMessageId);
    if (!message) return;
    this.clearAckTimer(message);
    this.outbox.delete(clientMessageId);
    this.emitOutbox();
  }

  private requeueSendingMessages(): void {
    for (const message of this.outbox.values()) {
      this.clearAckTimer(message);
      if (message.status === "sending") message.status = "queued";
    }
    this.emitOutbox();
  }

  private clearAckTimer(message: PendingMessage): void {
    const ackTimer = (
      message as PendingMessage & {
        ackTimer?: ReturnType<typeof setTimeout>;
      }
    ).ackTimer;
    if (ackTimer) clearTimeout(ackTimer);
  }

  private emitOutbox(): void {
    this.options.onOutboxChange(
      [...this.outbox.values()].map((message) => ({ ...message })),
    );
  }

  private readonly handleOnline = (): void => {
    if (this.stopped || this.socket) return;
    this.reconnectAttempt = 0;
    this.scheduleReconnect(0);
  };

  private readonly handleOffline = (): void => {
    if (this.stopped) return;
    this.options.onStatusChange("offline");
    this.socket?.close(4000, "Browser offline");
  };
}

export function getRealtimeUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) return explicit;

  const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
  const url = new URL(apiUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}
