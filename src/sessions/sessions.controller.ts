import { Controller, Get, Param, Delete, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { SessionsService } from './sessions.service';
import { SessionsGuard } from './sessions.guard';

@UseGuards(SessionsGuard)
@ApiCookieAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  async findAll(@Req() request: Request) {
    return await this.sessionsService.findAll(request.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() request: Request) {
    return await this.sessionsService.findOne(id, request.user.id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() request: Request) {
    return await this.sessionsService.remove(id, request.user.id);
  }
}
