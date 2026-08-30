import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeConnectionsModule } from '../realtime/realtime-connections.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [AuthModule, RealtimeConnectionsModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationsRepository],
  exports: [ConversationsService],
})
export class ConversationsModule {}
