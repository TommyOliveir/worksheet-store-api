import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { AuthService, AuthResponse } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { GetSessionId } from '../../common/decorators/get-session-id.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    return this.authService.register(dto, userAgent);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    return this.authService.login(dto, userAgent);
  }

  // Deliberately not @Public(): the guard has to resolve the session before
  // the handler can revoke it. A caller whose session is already gone gets a
  // 401, which the client treats as a completed logout.
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@GetSessionId() sessionId: string): Promise<void> {
    await this.authService.revokeSession(sessionId);
  }
}
