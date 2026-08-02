import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: 'event-chat-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    } as const;
  }
}
