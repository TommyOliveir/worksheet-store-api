import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  // The ID token (a JWT) Google Identity Services hands the browser.
  @IsString()
  @IsNotEmpty()
  credential!: string;
}
