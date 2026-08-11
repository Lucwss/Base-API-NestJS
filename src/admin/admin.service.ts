import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, ObjectLiteral } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import * as bcrypt from 'bcrypt';
import { BadRequestException } from '../exceptions/badRequest.exception';
import { ResourceNotFoundException } from '../exceptions/notFound.exception';
import { ADMIN_ENTITIES, AdminEntitySlug } from './admin.registry';
import { AdminField, getAdminEntityInfo } from './admin.metadata';
import { CSRF_FIELD } from './admin.permissions';

const SALT_ROUNDS = 14;
export const PAGE_SIZE = 50;

@Injectable()
export class AdminService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  private repo(slug: AdminEntitySlug) {
    return this.dataSource.getRepository(ADMIN_ENTITIES[slug]);
  }

  async list(
    slug: AdminEntitySlug,
    page = 1,
  ): Promise<{ rows: ObjectLiteral[]; page: number; total: number }> {
    const info = getAdminEntityInfo(this.dataSource, slug);
    const take = PAGE_SIZE;
    const skip = (Math.max(page, 1) - 1) * take;

    const [rows, total] = await this.repo(slug).findAndCount({
      take,
      skip,
      order: { [info.primaryKey]: 'ASC' },
    });

    return { rows, page: Math.max(page, 1), total };
  }

  async findOne(slug: AdminEntitySlug, id: string): Promise<ObjectLiteral> {
    const info = getAdminEntityInfo(this.dataSource, slug);
    this.assertValidId(id);

    const row = await this.repo(slug).findOneBy({ [info.primaryKey]: id });
    if (!row) {
      throw new ResourceNotFoundException({
        message: 'Not match data',
        action: 'Ensure your passing valid parameters',
      });
    }
    return row;
  }

  async create(
    slug: AdminEntitySlug,
    body: Record<string, unknown>,
  ): Promise<ObjectLiteral> {
    const info = getAdminEntityInfo(this.dataSource, slug);
    const payload = await this.coerce(info.fields, body, true);
    const repo = this.repo(slug);
    return await repo.save(repo.create(payload));
  }

  async update(
    slug: AdminEntitySlug,
    id: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const info = getAdminEntityInfo(this.dataSource, slug);
    await this.findOne(slug, id);

    const payload = await this.coerce(info.fields, body, false);
    if (Object.keys(payload).length === 0) {
      return;
    }
    await this.repo(slug).update(id, payload);
  }

  async remove(slug: AdminEntitySlug, id: string): Promise<void> {
    await this.findOne(slug, id);
    await this.repo(slug).delete(id);
  }

  private assertValidId(id: string): void {
    if (!uuidValidate(id)) {
      throw new BadRequestException({
        message: 'Invalid parameter for identification',
        action: 'Try again with correct parameter',
      });
    }
  }

  /**
   * Turns flat form strings into typed column values. Only fields the metadata
   * layer declared editable are read, so unknown keys in the POST body are
   * ignored rather than mass-assigned.
   */
  private async coerce(
    fields: AdminField[],
    body: Record<string, unknown>,
    isCreate: boolean,
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {};

    for (const field of fields) {
      if (field.readOnly || field.name === CSRF_FIELD) continue;

      const raw = body[field.name];

      if (field.widget === 'checkbox') {
        // Unchecked boxes are absent from the body entirely.
        payload[field.name] = raw === 'on' || raw === 'true' || raw === true;
        continue;
      }

      if (raw === undefined) continue;
      const value = typeof raw === 'string' ? raw.trim() : raw;

      if (field.widget === 'password') {
        // Blank on edit means "leave the existing hash alone".
        if (value === '' || value === undefined) {
          if (isCreate) {
            throw new BadRequestException({
              message: 'Password is required',
              action: 'Provide a password for the new record',
            });
          }
          continue;
        }
        payload[field.name] = await bcrypt.hash(String(value), SALT_ROUNDS);
        continue;
      }

      if (value === '') {
        payload[field.name] = null;
        continue;
      }

      if (field.widget === 'number') {
        const parsed = Number(value);
        if (Number.isNaN(parsed)) {
          throw new BadRequestException({
            message: `Invalid number for ${field.label}`,
            action: 'Provide a numeric value',
          });
        }
        payload[field.name] = parsed;
        continue;
      }

      if (field.widget === 'datetime') {
        const parsed = new Date(String(value));
        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException({
            message: `Invalid date for ${field.label}`,
            action: 'Provide a valid date',
          });
        }
        payload[field.name] = parsed;
        continue;
      }

      payload[field.name] = value;
    }

    return payload;
  }
}
