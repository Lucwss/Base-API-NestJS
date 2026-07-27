import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { UnauthorizedException } from '../exceptions/unauthorized.exception';
import { SessionsService } from './sessions.service';

@Injectable()
export class SessionsGuard implements CanActivate {
  constructor(private sessionsService: SessionsService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.sid as string | undefined;
    if (!token) {
      throw new UnauthorizedException({
        message: 'Authentication required',
        action: 'Log in to access this resource',
      });
    }

    const session = await this.sessionsService.findValidByToken(token);
    if (!session || !session.user.isActive) {
      throw new UnauthorizedException({
        message: 'Session expired or invalid',
        action: 'Log in again',
      });
    }

    request.user = session.user;
    request.sessionId = session.id;
    return true;
  }
}
