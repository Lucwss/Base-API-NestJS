import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { SessionEntity } from '../sessions/entities/session.entity';
import { SessionsModule } from 'src/sessions/sessions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, SessionEntity]),
    SessionsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
