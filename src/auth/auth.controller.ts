import { Controller, Post, Req, Res, Body, UseGuards } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { SessionsService } from '../sessions/sessions.service';
import { SessionsGuard } from '../sessions/sessions.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private sessionsService: SessionsService,
    private configService: ConfigService,
  ) {}

  @Post('login')
  async login(
    @Body() LoginDto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = await this.authService.login(LoginDto, {
      userAgent: request.headers['user-agent'] ?? null,
      ip: request.ip ?? null,
    });

    const ttlSeconds = this.configService.get<number>('SESSION_TTL_SECONDS')!;
    response.cookie('sid', token, {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: ttlSeconds * 1000,
    });

    return { message: 'Logged in successfully' };
  }

  @Post('logout')
  @UseGuards(SessionsGuard)
  @ApiCookieAuth()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.sessionsService.remove(request.sessionId, request.user.id);

    response.clearCookie('sid', {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax',
    });

    return { message: 'Logged out successfully' };
  }
}
