import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { RoleEntity } from './role.entity';

export type AdminAction = 'view' | 'add' | 'change' | 'delete';

export const ADMIN_ACTIONS: AdminAction[] = [
  'view',
  'add',
  'change',
  'delete',
];

@Entity('role_permissions')
export class RolePermissionEntity {
  @PrimaryColumn({ type: 'uuid' })
  roleId: string;

  /** Entity slug as exposed in admin URLs, e.g. `users`. */
  @PrimaryColumn({ type: 'varchar', length: 64 })
  entity: string;

  @PrimaryColumn({ type: 'varchar', length: 8 })
  action: AdminAction;

  @ManyToOne(() => RoleEntity, (role) => role.permissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'roleId' })
  role: RoleEntity;
}
