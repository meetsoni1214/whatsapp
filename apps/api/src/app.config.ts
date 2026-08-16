import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsAdapter } from '@nestjs/platform-ws';
import cookieParser from 'cookie-parser';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { requestIdMiddleware } from './common/http/request-id';

export function configureApp(app: INestApplication): void {
  app.useWebSocketAdapter(new WsAdapter(app));
  const config = app.get(ConfigService);

  app.use(requestIdMiddleware);
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    credentials: true,
    origin: config.getOrThrow<string>('WEB_ORIGIN'),
  });
}
