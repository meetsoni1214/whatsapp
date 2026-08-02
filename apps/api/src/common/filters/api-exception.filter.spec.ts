import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Get,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { apiErrorSchema, requestIdSchema } from '@event-chat/contracts';
import request from 'supertest';
import type { App } from 'supertest/types';
import { requestIdMiddleware, REQUEST_ID_HEADER } from '../http/request-id';
import { ApiExceptionFilter } from './api-exception.filter';

@Controller()
class ErrorController {
  @Get('validation-error')
  failValidation(): never {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: { field: 'invalid' },
    });
  }
}

describe('ApiExceptionFilter', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ErrorController],
    }).compile();

    app = module.createNestApplication();
    app.use(requestIdMiddleware);
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('preserves a valid request ID and normalizes known errors', async () => {
    const requestId = randomUUID();
    const response = await request(app.getHttpServer())
      .get('/validation-error')
      .set(REQUEST_ID_HEADER, requestId)
      .expect(400);

    expect(response.headers[REQUEST_ID_HEADER]).toBe(requestId);
    expect(apiErrorSchema.parse(response.body as unknown)).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      requestId,
      details: { field: 'invalid' },
    });
  });

  it('generates a request ID and normalizes framework errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/missing')
      .set(REQUEST_ID_HEADER, 'not-a-uuid')
      .expect(404);

    const error = apiErrorSchema.parse(response.body as unknown);
    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      requestId: response.headers[REQUEST_ID_HEADER],
    });
    expect(requestIdSchema.parse(error.requestId)).toBe(error.requestId);
  });
});
