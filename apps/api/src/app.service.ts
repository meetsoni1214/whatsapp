import {
  healthResponseSchema,
  type HealthResponse,
} from '@event-chat/contracts';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): HealthResponse {
    return healthResponseSchema.parse({
      service: 'event-chat-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  }
}
