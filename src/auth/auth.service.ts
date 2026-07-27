import { Injectable } from '@nestjs/common';
import { SessionsService } from 'src/sessions/sessions.service';
import { UsersService } from 'src/users/users.service';
import { LoginDto } from './dto/login.dto';
import { UnauthorizedException } from 'src/exceptions/unauthorized.exception';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private sessionsService: SessionsService,
  ) {}

  async login(
    loginDto: LoginDto,
    meta: { userAgent: string | null; ip: string | null },
  ) {
    const user = await this.usersService.findByUsernameForAuth(
      loginDto.username,
    );

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        message: 'Invalid credentials',
        action: 'Check your username and password',
      });
    }

    const passowrdMatches = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!passowrdMatches) {
      throw new UnauthorizedException({
        message: 'Invalid credentials',
        action: 'Check your username and password',
      });
    }

    const createdSession = this.sessionsService.create({
      userId: user.id,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    return createdSession;
  }
}
