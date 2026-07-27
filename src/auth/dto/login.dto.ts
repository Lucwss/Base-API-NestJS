import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(6)
  @MaxLength(39)
  username: string;

  @IsString()
  @MinLength(16)
  @MaxLength(64)
  password: string;
}
