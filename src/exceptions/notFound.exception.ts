import { HttpStatus } from '@nestjs/common';
import { IBaseExceptionParams } from './baseInterface';
import { BaseException } from './baseException';

export class ResourceNotFoundException extends BaseException {

  constructor({
                message = 'ResourceNotFound',
                action = 'Contact I.T support' }: IBaseExceptionParams) {
    super(message, action, HttpStatus.NOT_FOUND);
  }

  toJSON() {
    return {
      message: this.message,
      action: this.action
    }
  }
}