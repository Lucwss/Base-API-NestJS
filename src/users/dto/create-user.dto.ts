import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(6) // Based on GitHub username length
  @MaxLength(39) // Based on GitHub username length
  @Matches(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9]))*$/, {
    message:
      'username may only contain letters, numbers and single hyphens, ' +
      'and must start and end with a letter or number',
  })
  username: string;

  @IsString()
  @MaxLength(254) // Based on RFC 5321 and RFC 5322
  @IsEmail()
  email: string;

  @IsString() // https://bitwarden.com/blog/how-long-should-my-password-be/
  @MinLength(16)
  @MaxLength(64)
  password: string;
}
