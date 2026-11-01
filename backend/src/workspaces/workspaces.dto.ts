import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateWorkspaceDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;
}

export class AddMemberDto {
  @Transform(trim)
  @IsEmail()
  email: string;

  @IsOptional()
  @IsIn(['owner', 'member'])
  role?: 'owner' | 'member';
}
