import { HttpStatus } from '@nestjs/common';
import { IBaseExceptionParams } from './baseInterface';
import { BaseException } from './baseException';

export class UnauthorizedException extends BaseException {
  constructor({
    message = 'Unauthorized',
    action = 'Contact I.T support',
  }: IBaseExceptionParams) {
    super(message, action, HttpStatus.UNAUTHORIZED);
  }
}
