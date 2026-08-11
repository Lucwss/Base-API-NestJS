import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.permissions';
import { SessionsModule } from '../sessions/sessions.module';
import { AuthModule } from '../auth/auth.module';
import { RoleEntity } from './entities/role.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([RoleEntity, RolePermissionEntity]),
    SessionsModule,
    AuthModule,
  ],
  // AdminAuthController first: AdminController's `:entity` route would
  // otherwise match `/admin/login` before the login handler is reached.
  controllers: [AdminAuthController, AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
