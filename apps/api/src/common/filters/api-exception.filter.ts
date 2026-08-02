import { randomUUID } from 'node:crypto';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  apiErrorCodeSchema,
  apiErrorSchema,
  type ApiErrorCode,
} from '@event-chat/contracts';
import type { Response } from 'express';
import { REQUEST_ID_HEADER, type RequestWithId } from '../http/request-id';

interface ErrorResponse {
  code?: unknown;
  details?: unknown;
  message?: unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const requestId = request.requestId ?? randomUUID();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException) || status >= 500) {
      this.logger.error(
        `Unhandled request error (${requestId})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const errorResponse = this.readErrorResponse(exception);
    const error = apiErrorSchema.parse({
      code: this.readErrorCode(errorResponse.code, status),
      message: this.readMessage(errorResponse.message, status),
      requestId,
      ...(this.isDetails(errorResponse.details)
        ? { details: errorResponse.details }
        : {}),
    });

    response.setHeader(REQUEST_ID_HEADER, requestId);
    response.status(status).json(error);
  }

  private readErrorResponse(exception: unknown): ErrorResponse {
    if (!(exception instanceof HttpException)) return {};

    const response = exception.getResponse();
    if (typeof response === 'string') return { message: response };
    return this.isRecord(response) ? response : {};
  }

  private readErrorCode(value: unknown, status: number): ApiErrorCode {
    const parsedCode = apiErrorCodeSchema.safeParse(value);
    if (parsedCode.success) return parsedCode.data;

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

  private readMessage(value: unknown, status: number): string {
    if (typeof value === 'string' && value.length > 0) return value;
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((item): item is string => typeof item === 'string')
    ) {
      return value.join('; ');
    }

    if (status >= 500) return 'An unexpected error occurred';
    return HttpStatus[status] ?? 'Request failed';
  }

  private isDetails(value: unknown): value is Record<string, unknown> {
    return this.isRecord(value);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
