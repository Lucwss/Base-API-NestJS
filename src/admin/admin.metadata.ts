import { DataSource, EntityMetadata } from 'typeorm';
import { ADMIN_ENTITIES, AdminEntitySlug } from './admin.registry';

/**
 * Columns that must never reach a rendered page, even though TypeORM selects
 * them. `password` is already `select: false` and is dropped structurally by
 * `isSelect === false`; this covers secrets that are selectable.
 */
const HIDDEN_COLUMNS = new Set(['tokenHash']);

export type AdminWidget =
  | 'text'
  | 'password'
  | 'checkbox'
  | 'number'
  | 'datetime'
  | 'select'
  | 'textarea';

export interface AdminField {
  name: string;
  label: string;
  widget: AdminWidget;
  /** Rendered in lists/forms but never written back. */
  readOnly: boolean;
  required: boolean;
  maxLength?: number;
  options?: string[];
  isPrimary: boolean;
}

export interface AdminEntityInfo {
  slug: AdminEntitySlug;
  label: string;
  tableName: string;
  primaryKey: string;
  fields: AdminField[];
}

function humanize(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function widgetFor(
  type: string,
  isDate: boolean,
  enumValues: unknown[] | undefined,
): AdminWidget {
  if (enumValues?.length) return 'select';
  if (isDate) return 'datetime';
  if (type === 'boolean' || type === Boolean.name.toLowerCase())
    return 'checkbox';
  if (
    ['int', 'int2', 'int4', 'int8', 'integer', 'numeric', 'decimal'].includes(
      type,
    )
  ) {
    return 'number';
  }
  if (type === 'text') return 'textarea';
  return 'text';
}

function describe(
  metadata: EntityMetadata,
  slug: AdminEntitySlug,
): AdminField[] {
  const columns: AdminField[] = metadata.columns
    .filter((column) => {
      // `select: false` (e.g. users.password) never leaves the database here.
      if (column.isSelect === false) return false;
      return !HIDDEN_COLUMNS.has(column.propertyName);
    })
    .map((column) => {
      const type =
        typeof column.type === 'string'
          ? column.type
          : (column.type as { name?: string }).name?.toLowerCase() || 'text';
      const isDate =
        column.isCreateDate ||
        column.isUpdateDate ||
        type.startsWith('timestamp') ||
        type === 'date';

      return {
        name: column.propertyName,
        label: humanize(column.propertyName),
        widget: widgetFor(type, isDate, column.enum as unknown[] | undefined),
        // Generated ids and the audit timestamps are shown, never edited.
        readOnly:
          column.isPrimary ||
          column.isCreateDate ||
          column.isUpdateDate ||
          column.isGenerated,
        required: !column.isNullable && !column.isGenerated && !isDate,
        maxLength:
          typeof column.length === 'string' && column.length
            ? Number(column.length)
            : undefined,
        options: column.enum?.map(String),
        isPrimary: column.isPrimary,
      };
    });

  return columns.concat(virtualFieldsFor(slug));
}

/**
 * Fields the admin offers that are not readable columns. `password` is
 * write-only: never selected, never rendered with a value, only ever set.
 */
function virtualFieldsFor(slug: AdminEntitySlug): AdminField[] {
  if (slug !== 'users') return [];
  return [
    {
      name: 'password',
      label: 'Password',
      widget: 'password',
      readOnly: false,
      required: false,
      isPrimary: false,
    },
  ];
}

export function getAdminEntityInfo(
  dataSource: DataSource,
  slug: AdminEntitySlug,
): AdminEntityInfo {
  const metadata = dataSource.getMetadata(ADMIN_ENTITIES[slug]);
  return {
    slug,
    label: humanize(slug),
    tableName: metadata.tableName,
    primaryKey: metadata.primaryColumns[0].propertyName,
    fields: describe(metadata, slug),
  };
}

export function listAdminEntities(dataSource: DataSource): AdminEntityInfo[] {
  return (Object.keys(ADMIN_ENTITIES) as AdminEntitySlug[]).map((slug) =>
    getAdminEntityInfo(dataSource, slug),
  );
}
