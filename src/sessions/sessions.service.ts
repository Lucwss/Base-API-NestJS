import { Injectable } from '@nestjs/common';
import { CreateSessionDto } from './dto/create-session.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { SessionEntity } from './entities/session.entity';
import { DataSource, MoreThan, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '../exceptions/badRequest.exception';

@Injectable()
export class SessionsService {
  private readonly tokenSecret: string;
  private readonly ttlSeconds: number;
  constructor(
    @InjectRepository(SessionEntity)
    private sessionsRepository: Repository<SessionEntity>,
    private dataSource: DataSource,
    private configService: ConfigService,
  ) {
    this.tokenSecret = this.configService.get<string>('TOKEN_SECRET')!;
    this.ttlSeconds = this.configService.get<number>('SESSION_TTL_SECONDS')!;
  }

  async create(createSessionDto: CreateSessionDto): Promise<string> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const rawToken = crypto.randomBytes(32).toString('base64url');
      const tokenHash = this.hashToken(rawToken);
      const expires = new Date(Date.now() + this.ttlSeconds * 1000);

      const session = queryRunner.manager.create(SessionEntity, {
        ...createSessionDto,
        tokenHash,
        expires,
      });
      await queryRunner.manager.save(session);
      await queryRunner.commitTransaction();
      return rawToken;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(userId: string): Promise<SessionEntity[]> {
    return this.sessionsRepository.find({ where: { userId } });
  }

  async findOne(id: string, userId: string): Promise<SessionEntity | null> {
    return this.sessionsRepository.findOneBy({ id, userId });
  }

  update() {
    throw new BadRequestException({
      message: 'Not implemented functionality',
      action: 'Try it again soon',
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.sessionsRepository.delete({ id, userId });
  }

  async removeAll(userId: string): Promise<void> {
    await this.sessionsRepository.delete({ userId });
  }

  async findValidByToken(rawToken: string): Promise<SessionEntity | null> {
    const tokenHash = this.hashToken(rawToken);
    return this.sessionsRepository.findOne({
      where: { tokenHash, expires: MoreThan(new Date()) },
      relations: { user: true },
    });
  }

  private hashToken(rawToken: string): string {
    return crypto
      .createHmac('sha256', this.tokenSecret)
      .update(rawToken)
      .digest('hex');
  }
}
