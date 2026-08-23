import { randomUUID } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  apiErrorCodeSchema,
  clientFrameSchema,
  protocolVersion,
  requestIdSchema,
  serverFrameSchema,
  type ApiErrorCode,
  type ClientFrame,
  type ServerFrame,
  webSocketCloseCodes,
} from '@event-chat/contracts';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import WebSocket, { type RawData, type Server } from 'ws';
import { AuthTokenService } from '../auth/auth-token.service';
import { MessagesService } from '../messages/messages.service';
import {
  REALTIME_AUTH_TIMEOUT_MS,
  REALTIME_HEARTBEAT_INTERVAL_MS,
  REALTIME_MAX_PAYLOAD_BYTES,
} from './realtime.constants';
import {
  type RealtimeConnection,
  RealtimeConnectionsService,
} from './realtime-connections.service';

interface RealtimeError {
  code: ApiErrorCode;
  details?: Record<string, unknown>;
  message: string;
}

@WebSocketGateway({
  path: '/ws',
  maxPayload: REALTIME_MAX_PAYLOAD_BYTES,
})
export class RealtimeGateway
  implements
    OnGatewayInit<Server>,
    OnGatewayConnection<WebSocket>,
    OnGatewayDisconnect<WebSocket>,
    OnApplicationShutdown
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private heartbeatTimer?: NodeJS.Timeout;

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly tokens: AuthTokenService,
    private readonly messages: MessagesService,
    private readonly connections: RealtimeConnectionsService,
  ) {}

  afterInit(): void {
    this.heartbeatTimer = setInterval(
      () => this.runHeartbeat(),
      REALTIME_HEARTBEAT_INTERVAL_MS,
    );
    this.heartbeatTimer.unref();
  }

  handleConnection(socket: WebSocket): void {
    const connection = this.connections.add(socket);
    connection.authTimer = setTimeout(() => {
      if (connection.user) return;
      this.sendError(socket, {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authenticate within five seconds of connecting',
      });
      socket.close(1008, 'Authentication timeout');
    }, REALTIME_AUTH_TIMEOUT_MS);
    connection.authTimer.unref();

    socket.on('message', (data, isBinary) => {
      this.enqueue(connection, () => this.receive(connection, data, isBinary));
    });
    socket.on('pong', () => {
      connection.alive = true;
    });
  }

  handleDisconnect(socket: WebSocket): void {
    this.connections.remove(socket);
  }

  onApplicationShutdown(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.connections.closeAll(1001, 'Server shutting down');
  }

  private enqueue(
    connection: RealtimeConnection,
    task: () => Promise<void>,
  ): void {
    const queued = connection.queue.then(task);
    connection.queue = queued.catch((error: unknown) => {
      this.logger.error(
        'Unhandled realtime frame error',
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  private async receive(
    connection: RealtimeConnection,
    data: RawData,
    isBinary: boolean,
  ): Promise<void> {
    if (isBinary) {
      this.sendError(connection.socket, {
        code: 'VALIDATION_FAILED',
        message: 'Binary WebSocket frames are not supported',
      });
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(this.decodeData(data)) as unknown;
    } catch {
      this.sendError(connection.socket, {
        code: 'VALIDATION_FAILED',
        message: 'WebSocket frames must contain valid JSON',
      });
      if (!connection.user) connection.socket.close(1008, 'Invalid frame');
      return;
    }

    const requestId = this.readRequestId(value);
    const parsed = clientFrameSchema.safeParse(value);
    if (!parsed.success) {
      this.sendError(
        connection.socket,
        {
          code: 'VALIDATION_FAILED',
          message: 'The WebSocket frame is invalid',
          details: {
            issues: parsed.error.issues.map((issue) => ({
              message: issue.message,
              path: issue.path.join('.'),
            })),
          },
        },
        requestId,
      );
      if (!connection.user) connection.socket.close(1008, 'Invalid frame');
      return;
    }

    if (!connection.user) {
      await this.authenticate(connection, parsed.data);
      return;
    }

    await this.handleAuthenticatedFrame(connection, parsed.data);
  }

  private async authenticate(
    connection: RealtimeConnection,
    frame: ClientFrame,
  ): Promise<void> {
    if (frame.type !== 'auth.authenticate') {
      this.sendError(
        connection.socket,
        {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'The first frame must authenticate this connection',
        },
        frame.requestId,
      );
      connection.socket.close(1008, 'Authentication required');
      return;
    }

    try {
      const verified = await this.tokens.verifyAccessTokenSession(
        frame.payload.accessToken,
      );
      if (connection.authTimer) clearTimeout(connection.authTimer);
      this.connections.authenticate(connection, verified.user);

      const expiresIn = Math.max(0, verified.expiresAt.getTime() - Date.now());
      connection.expiryTimer = setTimeout(() => {
        this.sendError(connection.socket, {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'The access token has expired',
        });
        connection.socket.close(
          webSocketCloseCodes.tokenExpired,
          'Access token expired',
        );
      }, expiresIn);
      connection.expiryTimer.unref();

      this.send(connection.socket, {
        v: protocolVersion,
        type: 'auth.authenticated',
        eventId: randomUUID(),
        requestId: frame.requestId,
        occurredAt: new Date().toISOString(),
        payload: { user: verified.user },
      });
    } catch {
      this.sendError(
        connection.socket,
        {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'A valid access token is required',
        },
        frame.requestId,
      );
      connection.socket.close(1008, 'Authentication failed');
    }
  }

  private async handleAuthenticatedFrame(
    connection: RealtimeConnection,
    frame: ClientFrame,
  ): Promise<void> {
    if (frame.type === 'auth.authenticate') {
      this.sendError(
        connection.socket,
        {
          code: 'VALIDATION_FAILED',
          message: 'This connection is already authenticated',
        },
        frame.requestId,
      );
      return;
    }

    if (frame.type !== 'message.send') {
      this.sendError(
        connection.socket,
        {
          code: 'VALIDATION_FAILED',
          message: `${frame.type} is not available in this milestone`,
        },
        frame.requestId,
      );
      return;
    }

    try {
      const result = await this.messages.create(
        connection.user!.id,
        frame.payload,
      );
      const message = result.message;

      this.send(connection.socket, {
        v: protocolVersion,
        type: 'message.accepted',
        eventId: randomUUID(),
        requestId: frame.requestId,
        occurredAt: new Date().toISOString(),
        payload: {
          messageId: message.id,
          clientMessageId: message.clientMessageId,
          conversationId: message.conversationId,
          createdAt: message.createdAt,
        },
      });

      if (!result.inserted) return;

      const createdFrame: ServerFrame = {
        v: protocolVersion,
        type: 'message.created',
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        payload: {
          messageId: message.id,
          clientMessageId: message.clientMessageId,
          conversationId: message.conversationId,
          senderId: message.senderId,
          content: message.content,
          createdAt: message.createdAt,
        },
      };
      const serialized = JSON.stringify(serverFrameSchema.parse(createdFrame));
      for (const recipient of this.connections.forUsers(result.memberIds)) {
        this.sendSerialized(recipient.socket, serialized);
      }
    } catch (error) {
      const realtimeError = this.mapError(error);
      if (realtimeError.code === 'INTERNAL_ERROR') {
        this.logger.error(
          `Message command failed (${frame.requestId})`,
          error instanceof Error ? error.stack : String(error),
        );
      }
      this.sendError(connection.socket, realtimeError, frame.requestId);
    }
  }

  private runHeartbeat(): void {
    for (const connection of this.connections.all()) {
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }

      connection.alive = false;
      connection.socket.ping();
    }
  }

  private sendError(
    socket: WebSocket,
    error: RealtimeError,
    requestId?: string,
  ): void {
    this.send(socket, {
      v: protocolVersion,
      type: 'error',
      eventId: randomUUID(),
      ...(requestId ? { requestId } : {}),
      occurredAt: new Date().toISOString(),
      payload: error,
    });
  }

  private send(socket: WebSocket, frame: ServerFrame): void {
    this.sendSerialized(socket, JSON.stringify(serverFrameSchema.parse(frame)));
  }

  private sendSerialized(socket: WebSocket, serialized: string): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(serialized);
  }

  private decodeData(data: RawData): string {
    if (Buffer.isBuffer(data)) return data.toString('utf8');
    if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
    return Buffer.from(data).toString('utf8');
  }

  private readRequestId(value: unknown): string | undefined {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('requestId' in value)
    ) {
      return undefined;
    }

    const parsed = requestIdSchema.safeParse(value.requestId);
    return parsed.success ? parsed.data : undefined;
  }

  private mapError(error: unknown): RealtimeError {
    if (!(error instanceof HttpException)) {
      return {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      };
    }

    const status = error.getStatus();
    const response = error.getResponse();
    const body =
      typeof response === 'object' && response !== null
        ? (response as Record<string, unknown>)
        : {};
    const parsedCode = apiErrorCodeSchema.safeParse(body.code);
    const code = parsedCode.success
      ? parsedCode.data
      : this.codeForStatus(status);
    const message =
      typeof body.message === 'string'
        ? body.message
        : typeof response === 'string'
          ? response
          : (HttpStatus[status] ?? 'Request failed');

    return { code, message };
  }

  private codeForStatus(status: number): ApiErrorCode {
    switch (status) {
      case 400:
        return 'VALIDATION_FAILED';
      case 401:
        return 'AUTHENTICATION_REQUIRED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
