import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { User } from '@prisma/client';
import {
  AuthService,
  AuthResult,
  StaleRefreshTokenException,
} from './auth.service';
import { AuthCookieService } from './auth-cookie.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenContext } from './strategies/jwt-refresh.strategy';
import { Public } from '../../common/decorators/public.decorator';
import { GetSessionId } from '../../common/decorators/get-session-id.decorator';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';

// Tokens travel only as httpOnly cookies; the body carries the user alone.
export interface AuthResponse {
  user: Omit<User, 'password'>;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookies: AuthCookieService,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.authService.register(dto, userAgent));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.authService.login(dto, userAgent));
  }

  // @Public() because the access token is expected to have expired by the
  // time this is called; JwtRefreshGuard checks the refresh token instead.
  @Public()
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request & { user: RefreshTokenContext },
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { sessionId, refreshToken } = req.user;

    try {
      return this.respond(
        res,
        await this.authService.refresh(sessionId, refreshToken),
      );
    } catch (error) {
      // A lost race leaves the winning request's fresh cookies in the
      // browser; clearing here would delete those and sign the user out.
      if (!(error instanceof StaleRefreshTokenException)) {
        this.authCookies.clearAuthCookies(res);
      }
      throw error;
    }
  }

  // Deliberately not @Public(): the guard has to resolve the session before
  // the handler can revoke it. A caller whose access token has expired
  // refreshes and retries; one whose session is already gone gets a 401,
  // which the client treats as a completed logout.
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @GetSessionId() sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.revokeSession(sessionId);
    this.authCookies.clearAuthCookies(res);
  }

  private respond(res: Response, { user, tokens }: AuthResult): AuthResponse {
    this.authCookies.setAuthCookies(res, tokens);
    return { user };
  }
}
