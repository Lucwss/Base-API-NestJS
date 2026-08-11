import { UserEntity } from '../users/entities/user.entity';
import { SessionEntity } from '../sessions/entities/session.entity';
import { RoleEntity } from './entities/role.entity';

/**
 * Entities exposed in the admin, keyed by their URL slug.
 *
 * Explicit map rather than a decorator: app.module.ts already lists entities
 * explicitly, and a second registration mechanism for a list that changes
 * twice a year is machinery for nothing.
 */
export const ADMIN_ENTITIES = {
  users: UserEntity,
  sessions: SessionEntity,
  roles: RoleEntity,
} as const;

export type AdminEntitySlug = keyof typeof ADMIN_ENTITIES;

export function isAdminSlug(slug: string): slug is AdminEntitySlug {
  return Object.prototype.hasOwnProperty.call(ADMIN_ENTITIES, slug);
}
