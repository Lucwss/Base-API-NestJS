import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { Request, Response } from 'express';
import { SessionsGuard } from '../sessions/sessions.guard';
import { ResourceNotFoundException } from '../exceptions/notFound.exception';
import { AdminService, PAGE_SIZE } from './admin.service';
import { getAdminEntityInfo, listAdminEntities } from './admin.metadata';
import { ADMIN_ENTITIES, AdminEntitySlug, isAdminSlug } from './admin.registry';
import {
  AdminGuard,
  AdminPerm,
  CSRF_COOKIE,
  CSRF_FIELD,
  issueCsrfToken,
  viewableEntities,
} from './admin.permissions';

type FormBody = Record<string, string>;

/**
 * Handlers use `@Res()` deliberately: it marks the response as handled and so
 * bypasses the global ClassSerializerInterceptor, which otherwise rewrites the
 * view model (Dates become ISO strings) before Handlebars ever sees it.
 */
@ApiExcludeController()
@Controller('admin')
@UseGuards(SessionsGuard, AdminGuard)
export class AdminController {
  constructor(
    private adminService: AdminService,
    private configService: ConfigService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  @Get()
  async index(@Req() req: Request, @Res() res: Response): Promise<void> {
    res.render('index', await this.base(req, res));
  }

  @Get(':entity')
  @AdminPerm('view')
  async list(
    @Param('entity') entity: string,
    @Query('page') page: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const slug = this.slug(entity);
    const info = getAdminEntityInfo(this.dataSource, slug);
    const {
      rows,
      page: current,
      total,
    } = await this.adminService.list(slug, Number(page) || 1);
    const columns = info.fields.filter((field) => field.widget !== 'password');

    res.render('list', {
      ...(await this.base(req, res, slug)),
      info,
      columns,
      rows: rows.map((row) => ({
        id: row[info.primaryKey],
        // Cells carry their type so booleans can render as pills; display()
        // alone would flatten them to the strings "true"/"false".
        cells: columns.map((field) => ({
          text: this.display(row[field.name]),
          isBool: field.widget === 'checkbox',
          on: row[field.name] === true,
        })),
      })),
      page: current,
      total,
      from: total === 0 ? 0 : (current - 1) * PAGE_SIZE + 1,
      to: Math.min(current * PAGE_SIZE, total),
      hasPrev: current > 1,
      hasNext: current * PAGE_SIZE < total,
      prevPage: current - 1,
      nextPage: current + 1,
    });
  }

  @Get(':entity/add')
  @AdminPerm('add')
  async addForm(
    @Param('entity') entity: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const slug = this.slug(entity);
    const info = getAdminEntityInfo(this.dataSource, slug);
    res.render('form', {
      ...(await this.base(req, res, slug)),
      info,
      isCreate: true,
      fields: info.fields
        .filter((field) => !field.readOnly)
        .map((field) => this.widgetFlags(field, undefined)),
    });
  }

  @Post(':entity/add')
  @AdminPerm('add')
  async create(
    @Param('entity') entity: string,
    @Body() body: FormBody,
    @Res() res: Response,
  ): Promise<void> {
    const slug = this.slug(entity);
    await this.adminService.create(slug, body);
    res.redirect(`/admin/${slug}`);
  }

  @Get(':entity/:id')
  @AdminPerm('change')
  async editForm(
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const slug = this.slug(entity);
    const info = getAdminEntityInfo(this.dataSource, slug);
    const row = await this.adminService.findOne(slug, id);

    res.render('form', {
      ...(await this.base(req, res, slug)),
      info,
      isCreate: false,
      recordId: row[info.primaryKey],
      fields: info.fields.map((field) =>
        this.widgetFlags(field, row[field.name]),
      ),
    });
  }

  @Post(':entity/:id')
  @AdminPerm('change')
  async update(
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Body() body: FormBody,
    @Res() res: Response,
  ): Promise<void> {
    const slug = this.slug(entity);
    await this.adminService.update(slug, id, body);
    res.redirect(`/admin/${slug}`);
  }

  @Post(':entity/:id/delete')
  @AdminPerm('delete')
  async remove(
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const slug = this.slug(entity);
    await this.adminService.remove(slug, id);
    res.redirect(`/admin/${slug}`);
  }

  private slug(entity: string): AdminEntitySlug {
    if (!isAdminSlug(entity)) {
      throw new ResourceNotFoundException({
        message: 'Unknown admin section',
        action: 'Pick a section from the admin index',
      });
    }
    return entity;
  }

  /**
   * Mints the CSRF cookie and the shared template variables, including the
   * sidebar. Every page renders the nav, so the permission filter lives here
   * rather than being repeated per route.
   */
  private async base(
    req: Request,
    res: Response,
    activeSlug?: AdminEntitySlug,
  ) {
    let token = (req.cookies?.[CSRF_COOKIE] as string | undefined) ?? '';
    if (!token) {
      token = issueCsrfToken();
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }

    const allowed = await viewableEntities(
      this.dataSource,
      req.user.id,
      req.user.isSuperuser,
      Object.keys(ADMIN_ENTITIES),
    );

    return {
      csrfField: CSRF_FIELD,
      csrfToken: token,
      currentUser: req.user.username,
      isSuperuser: req.user.isSuperuser,
      brand: this.configService.get<string>('ADMIN_BRAND') ?? 'Admin',
      navItems: listAdminEntities(this.dataSource)
        .filter((entity) => allowed.includes(entity.slug))
        // Handlebars has no equality helper; precompute the active branch.
        .map((entity) => ({ ...entity, active: entity.slug === activeSlug })),
    };
  }

  private widgetFlags(
    field: {
      name: string;
      label: string;
      widget: string;
      readOnly: boolean;
      required: boolean;
      maxLength?: number;
      options?: string[];
    },
    value: unknown,
  ) {
    return {
      ...field,
      // Handlebars has no equality helper built in; precompute the branches.
      isText: field.widget === 'text',
      isTextarea: field.widget === 'textarea',
      isPassword: field.widget === 'password',
      isCheckbox: field.widget === 'checkbox',
      isNumber: field.widget === 'number',
      isDatetime: field.widget === 'datetime',
      isSelect: field.widget === 'select',
      checked: value === true,
      // A password value is never echoed back into the form.
      value: field.widget === 'password' ? '' : this.display(value),
    };
  }

  private display(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 16);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    // Relations and JSON columns would otherwise render as "[object Object]".
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'bigint') {
      return value.toString();
    }
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
}
