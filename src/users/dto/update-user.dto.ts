import { IsBoolean, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { OmitType, PartialType } from '@nestjs/mapped-types';

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
