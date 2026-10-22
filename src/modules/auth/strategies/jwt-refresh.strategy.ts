import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { AUTH_CONFIG, AuthConfig } from '../auth.config';
import { REFRESH_TOKEN_COOKIE } from '../auth-cookie.service';

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  jti: string;
}

export interface RefreshTokenContext {
  sessionId: string;
  refreshToken: string;
}

function extractRefreshToken(req: Request): string | null {
  return (req?.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined) ?? null;
}

// Only checks that the refresh token is genuine and unexpired. Whether it is
// still the session's current token is decided in AuthService.refresh, which
// has to compare and rotate it in one step.
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(@Inject(AUTH_CONFIG) config: AuthConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractRefreshToken]),
      ignoreExpiration: false,
      secretOrKey: config.refreshSecret,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: RefreshTokenPayload): RefreshTokenContext {
    const refreshToken = extractRefreshToken(req);

    if (!payload.sid || !refreshToken) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    return { sessionId: payload.sid, refreshToken };
  }
}
