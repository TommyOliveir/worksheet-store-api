import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AuthCookieService } from '../../modules/auth/auth-cookie.service';

@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  constructor(private readonly authCookies: AuthCookieService) {
    super();
  }

  // A refresh token that fails here is dead for good, and the browser cannot
  // remove an httpOnly cookie itself, so the rejection clears them both.
  handleRequest<TUser>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    try {
      return super.handleRequest(err, user, info, context);
    } catch (error) {
      this.authCookies.clearAuthCookies(
        context.switchToHttp().getResponse<Response>(),
      );
      throw error;
    }
  }
}
