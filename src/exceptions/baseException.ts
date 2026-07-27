import { HttpException, HttpStatus } from '@nestjs/common';
import { IBaseExceptionParams } from './baseInterface';

export abstract class BaseException extends HttpException {
  readonly action: string;

  protected constructor(
    message: string,
    action: string,
    status: HttpStatus,
    options?: { cause?: Error }
  ) {
    super(message, status, options);
    this.action = action;
  }
  abstract toJSON(): IBaseExceptionParams;
}