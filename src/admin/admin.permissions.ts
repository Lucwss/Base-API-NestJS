import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import * as crypto from 'crypto';
import { UnauthorizedException } from '../exceptions/unauthorized.exception';
import { BadRequestException } from '../exceptions/badRequest.exception';
import { AdminAction } from './entities/role-permission.entity';

export const ADMIN_PERM_KEY = 'admin:permission';

export const AdminPerm = (action: AdminAction) =>
  SetMetadata(ADMIN_PERM_KEY, action);

export const CSRF_COOKIE = 'admincsrf';
export const CSRF_FIELD = '_csrf';

export function issueCsrfToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Constant-time compare that tolerates differing lengths. */
function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Runs after SessionsGuard, which has already populated `request.user`.
 * Authorises the admin action and enforces double-submit CSRF on writes.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException({
        message: 'Authentication required',
        action: 'Log in to access the admin',
      });
    }

    if (request.method !== 'GET') {
      this.assertCsrf(request);
    }

    if (user.isSuperuser) {
      return true;
    }

    const action = this.reflector.getAllAndOverride<AdminAction | undefined>(
      ADMIN_PERM_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No declared permission means the route only requires staff standing,
    // which for a non-superuser means holding at least one role.
    const rawEntity: unknown = request.params?.entity;
    const entity = typeof rawEntity === 'string' ? rawEntity : undefined;
    const allowed = action
      ? await this.hasPermission(user.id, entity, action)
      : await this.hasAnyRole(user.id);

    if (!allowed) {
      throw new UnauthorizedException({
        message: 'You do not have permission to perform this action',
        action: 'Ask an administrator to grant you access',
      });
    }

    return true;
  }

  private assertCsrf(request: Request): void {
    const cookieToken = request.cookies?.[CSRF_COOKIE] as string | undefined;
    const body = request.body as Record<string, unknown> | undefined;
    const formToken = body?.[CSRF_FIELD];

    if (
      !cookieToken ||
      typeof formToken !== 'string' ||
      !tokensMatch(cookieToken, formToken)
    ) {
      throw new BadRequestException({
        message: 'Invalid or missing CSRF token',
        action: 'Reload the page and submit the form again',
      });
    }
  }

  private async hasPermission(
    userId: string,
    entity: string | undefined,
    action: AdminAction,
  ): Promise<boolean> {
    if (!entity) return false;
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM "user_roles" ur
         JOIN "role_permissions" rp ON rp."roleId" = ur."roleId"
        WHERE ur."userId" = $1 AND rp."entity" = $2 AND rp."action" = $3
        LIMIT 1`,
      [userId, entity, action],
    );
    return rows.length > 0;
  }

  private async hasAnyRole(userId: string): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM "user_roles" WHERE "userId" = $1 LIMIT 1`,
      [userId],
    );
    return rows.length > 0;
  }
}

/** Entities the user may `view`, used to build the admin index. */
export async function viewableEntities(
  dataSource: DataSource,
  userId: string,
  isSuperuser: boolean,
  allSlugs: string[],
): Promise<string[]> {
  if (isSuperuser) return allSlugs;
  const rows: { entity: string }[] = await dataSource.query(
    `SELECT DISTINCT rp."entity" FROM "user_roles" ur
       JOIN "role_permissions" rp ON rp."roleId" = ur."roleId"
      WHERE ur."userId" = $1 AND rp."action" = 'view'`,
    [userId],
  );
  const granted = new Set(rows.map((row) => row.entity));
  return allSlugs.filter((slug) => granted.has(slug));
}
