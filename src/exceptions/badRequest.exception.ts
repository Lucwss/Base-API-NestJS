import { IBaseExceptionParams } from './baseInterface';
import { HttpStatus } from '@nestjs/common';
import { BaseException } from './baseException';

export class BadRequestException extends BaseException {
  constructor({
    message = 'BadRequest',
    action = 'Contact I.T support',
  }: IBaseExceptionParams) {
    super(message, action, HttpStatus.BAD_REQUEST);
  }
}
