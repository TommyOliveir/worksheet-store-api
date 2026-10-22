import { Inject, Injectable } from '@nestjs/common';
import { CookieOptions, Response } from 'express';
import { AUTH_CONFIG, AuthConfig } from './auth.config';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

// The refresh token is only ever read by /auth/refresh and /auth/logout, so it
// is scoped to /auth and not sent along with every other API call.
const REFRESH_TOKEN_PATH = '/auth';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthCookieService {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  setAuthCookies(res: Response, tokens: AuthTokens): void {
    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      ...this.baseOptions(),
      path: '/',
      maxAge: this.config.accessTtlSeconds * 1000,
    });
    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...this.baseOptions(),
      path: REFRESH_TOKEN_PATH,
      maxAge: this.config.refreshTtlSeconds * 1000,
    });
  }

  // clearCookie only matches a cookie set with the same path and attributes,
  // so these mirror setAuthCookies exactly.
  clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { ...this.baseOptions(), path: '/' });
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...this.baseOptions(),
      path: REFRESH_TOKEN_PATH,
    });
  }

  private baseOptions(): CookieOptions {
    return {
      // Not readable from JavaScript, so an XSS on the site cannot take the
      // tokens with it.
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: this.config.cookieSameSite,
    };
  }
}
