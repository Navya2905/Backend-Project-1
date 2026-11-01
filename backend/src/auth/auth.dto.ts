import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RegisterDto {
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email: string;

  // scrypt has no input limit, but very long passwords are a cheap way to burn CPU.
  @IsString()
  @Length(8, 128)
  password: string;

  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  workspaceName?: string;
}

export class LoginDto {
  @Transform(trim)
  @IsEmail()
  email: string;

  @IsString()
  @Length(1, 128)
  password: string;
}
