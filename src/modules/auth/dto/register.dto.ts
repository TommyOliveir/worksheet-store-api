import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  // `role` is intentionally absent. It used to be accepted here and spread
  // into the create, which let anyone register themselves as ADMIN with a
  // plain curl. New accounts take the schema default (BUYER).
}
