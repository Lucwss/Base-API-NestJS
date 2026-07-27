import {
  IsBoolean,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MaxLength(39) // Based on GitHub username length
  @MinLength(6) // Based on GitHub username length
  username: string;

  @IsString()
  @MaxLength(64)
  @IsEmail()
  email: string;

  @IsString() // https://bitwarden.com/blog/how-long-should-my-password-be/
  @MinLength(16)
  @MaxLength(64)
  password: string;

  @IsBoolean()
  isActive: boolean;
}
