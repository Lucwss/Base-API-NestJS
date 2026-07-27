import { BaseException } from './baseException';
import { HttpStatus } from '@nestjs/common';
import { IBaseExceptionParams } from './baseInterface';

export class MethodNotAllowedException extends BaseException {
  constructor({
    message = 'MethodNotAllowed',
    action = 'Contact I.T support',
  }: IBaseExceptionParams) {
    super(message, action, HttpStatus.METHOD_NOT_ALLOWED);
  }
}
