import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagesModule } from '../messages/messages.module';
import { UsersModule } from '../users/users.module';
import { PresenceService } from './presence.service';
import { RealtimeConnectionsModule } from './realtime-connections.module';
import { TypingService } from './typing.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [
    AuthModule,
    ConversationsModule,
    MessagesModule,
    RealtimeConnectionsModule,
    UsersModule,
  ],
  providers: [PresenceService, TypingService, RealtimeGateway],
})
export class RealtimeModule {}
