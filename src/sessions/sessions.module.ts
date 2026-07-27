import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionEntity } from './entities/session.entity';
import { UserEntity } from '../users/entities/user.entity';
import { SessionsGuard } from './sessions.guard';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, SessionEntity])],
  controllers: [SessionsController],
  providers: [SessionsService, SessionsGuard],
  exports: [TypeOrmModule, SessionsService, SessionsGuard],
})
export class SessionsModule {}
