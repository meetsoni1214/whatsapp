import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MessagesModule } from '../messages/messages.module';
import { RealtimeConnectionsService } from './realtime-connections.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule, MessagesModule],
  providers: [RealtimeConnectionsService, RealtimeGateway],
})
export class RealtimeModule {}
