import { Module } from '@nestjs/common';
import { RealtimeConnectionsService } from './realtime-connections.service';

@Module({
  providers: [RealtimeConnectionsService],
  exports: [RealtimeConnectionsService],
})
export class RealtimeConnectionsModule {}
