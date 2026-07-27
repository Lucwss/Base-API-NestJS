import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { DataSource, Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { BadRequestException } from '../exceptions/badRequest.exception';
import { ResourceNotFoundException } from '../exceptions/notFound.exception';
import { IDefaultResponse } from './response.interface';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  SALT_ROUNDS: number;

  constructor(
    @InjectRepository(UserEntity)
    private usersRepository: Repository<UserEntity>,
    private dataSource: DataSource,
  ) {
    this.SALT_ROUNDS = 14;
  }

  async create(createUserDto: CreateUserDto): Promise<UserEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    await this.validateUserExists(createUserDto.email);

    try {
      const hashedPassword = await bcrypt.hash(
        createUserDto.password,
        this.SALT_ROUNDS,
      );
      const user = queryRunner.manager.create(UserEntity, {
        ...createUserDto,
        password: hashedPassword,
      });
      const saved = await queryRunner.manager.save(user);
      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(): Promise<UserEntity[]> {
    return await this.usersRepository.find();
  }

  async findOne(id: string): Promise<UserEntity | null> {
    if (!uuidValidate(id)) {
      throw new BadRequestException({
        message: 'Invalid parameter for identification',
        action: 'Try again with correct parameter',
      });
    }

    const foundUser = await this.usersRepository.findOneBy({ id });
    if (!foundUser) {
      throw new ResourceNotFoundException({
        message: 'Not match data',
        action: 'Ensure your passing valid parameters',
      });
    }
    return foundUser;
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<IDefaultResponse> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    if (Object.keys(updateUserDto).length === 0) {
      throw new BadRequestException({
        message: 'No fields to update',
        action: 'Send at least one field to change',
      });
    }

    if (!uuidValidate(id)) {
      throw new BadRequestException({
        message: 'Invalid parameter for identification',
        action: 'Try again with correct parameter',
      });
    }

    const foundUser = await this.usersRepository.findOneBy({ id });
    if (!foundUser) {
      throw new ResourceNotFoundException({
        message: 'Not match data',
        action: 'Ensure your passing valid parameters',
      });
    }

    try {
      const updatedUser = await queryRunner.manager.update(
        UserEntity,
        id,
        updateUserDto,
      );

      await queryRunner.commitTransaction();
      if (updatedUser.affected && updatedUser.affected > 0) {
        return {
          message: 'User updated successfully',
          action: 'You can now fetch the updated user data',
        };
      }
      return {
        message: 'No changes were made to the user',
        action: 'Ensure the update data is different from the existing data',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string): Promise<void> {
    if (!uuidValidate(id)) {
      throw new BadRequestException({
        message: 'Invalid parameter for identification',
        action: 'Try again with correct parameter',
      });
    }

    const foundUser = await this.usersRepository.findOneBy({ id });
    if (!foundUser) {
      throw new ResourceNotFoundException({
        message: 'Not match data',
        action: 'Ensure your passing valid parameters',
      });
    }

    await this.usersRepository.delete(id);
  }

  private async validateUserExists(email: string): Promise<void> {
    const userAlreadyInDatabase = await this.usersRepository.findOneBy({
      email,
    });
    if (userAlreadyInDatabase) {
      throw new BadRequestException({
        message: 'User already exists',
        action: 'Try again with a different email',
      });
    }
  }

  async findByUsernameForAuth(username: string): Promise<UserEntity | null> {
    return await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.username = :username', { username })
      .getOne();
  }
}
