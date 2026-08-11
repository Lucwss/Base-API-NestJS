import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { LoginDto } from '../auth/dto/login.dto';
import { SessionsService } from '../sessions/sessions.service';
import { CSRF_COOKIE, CSRF_FIELD, issueCsrfToken } from './admin.permissions';

/**
 * The admin's own login page. Deliberately outside SessionsGuard/AdminGuard:
 * these are the only admin routes an anonymous visitor may reach.
 */
@ApiExcludeController()
@Controller('admin')
export class AdminAuthController {
  constructor(
    private authService: AuthService,
    private sessionsService: SessionsService,
    private configService: ConfigService,
  ) {}

  @Get('login')
  loginForm(
    @Query('next') next: string,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    res.render('login', { ...this.csrf(req, res), next: safeNext(next) });
  }

  /**
   * Where AdminGuard denials land. Must stay unguarded: a user with no roles is
   * refused by /admin itself, so pointing denials there loops forever.
   */
  @Get('denied')
  async denied(@Req() req: Request, @Res() res: Response): Promise<void> {
    const token = req.cookies?.sid as string | undefined;
    const session = token
      ? await this.sessionsService.findValidByToken(token)
      : null;

    // Not a permissions problem — they have no session at all.
    if (!session) {
      res.redirect('/admin/login');
      return;
    }

    // `deniedUser`, not `currentUser`: layout.hbs keys the whole sidebar off
    // `currentUser`, and this page must not offer links the user cannot open.
    res.render('denied', {
      ...this.csrf(req, res),
      deniedUser: session.user.username,
    });
  }

  @Post('login')
  async login(
    @Body() body: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const next = safeNext(body.next);
    const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;

    if (!cookieToken || body[CSRF_FIELD] !== cookieToken) {
      res.render('login', {
        ...this.csrf(req, res),
        next,
        error: 'Session expired. Please try again.',
      });
      return;
    }

    // This controller calls AuthService directly, so ValidationPipe never sees
    // the body; check the DTO's own rules here.
    const dto = plainToInstance(LoginDto, {
      username: body.username,
      password: body.password,
    });
    const problems = await validate(dto);
    if (problems.length > 0) {
      res.render('login', {
        ...this.csrf(req, res),
        next,
        error: 'Username must be 6-39 characters and password 16-64.',
      });
      return;
    }

    let token: string;
    try {
      token = await this.authService.login(
        { username: body.username, password: body.password },
        {
          userAgent: req.headers['user-agent'] ?? null,
          ip: req.ip ?? null,
        },
      );
    } catch {
      // Never distinguish unknown user from bad password.
      res.render('login', {
        ...this.csrf(req, res),
        next,
        error: 'Invalid credentials.',
      });
      return;
    }

    res.cookie('sid', token, {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: this.configService.get<number>('SESSION_TTL_SECONDS')! * 1000,
    });
    res.redirect(next);
  }

  @Post('logout')
  async logout(
    @Body() body: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
    if (!cookieToken || body[CSRF_FIELD] !== cookieToken) {
      res.redirect('/admin');
      return;
    }

    const token = req.cookies?.sid as string | undefined;
    const session = token
      ? await this.sessionsService.findValidByToken(token)
      : null;
    if (session) {
      await this.sessionsService.remove(session.id, session.user.id);
    }
    res.clearCookie('sid', {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax',
    });
    res.redirect('/admin/login');
  }

  private csrf(req: Request, res: Response) {
    let token = (req.cookies?.[CSRF_COOKIE] as string | undefined) ?? '';
    if (!token) {
      token = issueCsrfToken();
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }
    return {
      csrfField: CSRF_FIELD,
      csrfToken: token,
      brand: this.configService.get<string>('ADMIN_BRAND') ?? 'Admin',
    };
  }
}

/** Only same-site paths, so `?next=` can't be turned into an open redirect. */
function safeNext(next: string | undefined): string {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/admin';
}
