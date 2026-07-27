import { HttpException, HttpStatus } from '@nestjs/common';
import { IBaseExceptionParams } from './baseInterface';
import { BaseException } from './baseException';

export class InternalServerErrorException extends BaseException {

  constructor({
                message = 'InternalServerError',
                action = 'Contact I.T support' }: IBaseExceptionParams) {
    super(message, action, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  toJSON() {
    return {
      message: this.message,
      action: this.action
    }
  }
}