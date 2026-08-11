import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BaseException } from './baseException';
import { InternalServerErrorException } from './interalServerError.exception';

@Catch()
export class AllHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (response.headersSent) {
      return;
    }

    const meta = {
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // The admin is a browser UI, so an auth failure there belongs on a page
    // rather than as a JSON 401 the user cannot act on. Anonymous visitors go
    // to the login form; an authenticated user who lacks the permission goes to
    // /admin/denied, which is deliberately unguarded — sending them to /admin
    // instead loops forever, since /admin denies roleless users too.
    const status =
      exception instanceof HttpException ? exception.getStatus() : 0;
    if (
      status === 401 &&
      request.url.startsWith('/admin') &&
      !request.url.startsWith('/admin/login') &&
      !request.url.startsWith('/admin/denied')
    ) {
      return response.redirect(
        request.user
          ? '/admin/denied'
          : `/admin/login?next=${encodeURIComponent(request.url)}`,
      );
    }

    // 1. Your own exceptions — pass through as-is.
    if (exception instanceof BaseException) {
      return response.status(exception.getStatus()).json({
        statusCode: exception.getStatus(),
        ...exception.toJSON(),
        ...meta,
      });
    }

    // 2. Framework exceptions (ValidationPipe, 404 routes, guards).
    if (exception instanceof HttpException) {
      const body = exception.getResponse();

      return response.status(exception.getStatus()).json({
        statusCode: exception.getStatus(),
        message: typeof body === 'string' ? body : (body as any).message,
        ...meta,
      });
    }

    // 3. Anything else — log it, then hide it behind a generic 500.
    this.logger.error(
      `Unhandled exception on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    const fallback = new InternalServerErrorException({});

    return response.status(fallback.getStatus()).json({
      statusCode: fallback.getStatus(),
      ...fallback.toJSON(),
      ...meta,
    });
  }
}
