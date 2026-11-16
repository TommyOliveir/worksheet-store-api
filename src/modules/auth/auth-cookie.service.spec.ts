import { describe, expect, it, vi } from 'vitest';
import { Response } from 'express';
import { AuthCookieService } from './auth-cookie.service';
import { AuthConfig } from './auth.config';

const baseConfig: AuthConfig = {
  accessSecret: 'access-secret',
  refreshSecret: 'refresh-secret',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 604800,
  cookieSecure: true,
  cookieSameSite: 'lax',
  cookiePathPrefix: '',
};

function cookiePaths(cookiePathPrefix: string) {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  const service = new AuthCookieService({ ...baseConfig, cookiePathPrefix });
  const response = res as unknown as Response;

  service.setAuthCookies(response, { accessToken: 'a', refreshToken: 'r' });
  service.clearAuthCookies(response);

  const pathOf = (calls: unknown[][], name: string) =>
    (calls.find(([n]) => n === name)?.at(-1) as { path: string }).path;

  return {
    setAccess: pathOf(res.cookie.mock.calls, 'access_token'),
    setRefresh: pathOf(res.cookie.mock.calls, 'refresh_token'),
    clearAccess: pathOf(res.clearCookie.mock.calls, 'access_token'),
    clearRefresh: pathOf(res.clearCookie.mock.calls, 'refresh_token'),
  };
}

describe('AuthCookieService paths', () => {
  it('scopes the refresh token to /auth when the API is called directly', () => {
    expect(cookiePaths('')).toEqual({
      setAccess: '/',
      setRefresh: '/auth',
      clearAccess: '/',
      clearRefresh: '/auth',
    });
  });

  it('prefixes the refresh token path when the UI proxies the API', () => {
    // The browser calls /api/auth/refresh, so that is the path that must match.
    expect(cookiePaths('/api')).toEqual({
      setAccess: '/',
      setRefresh: '/api/auth',
      clearAccess: '/',
      clearRefresh: '/api/auth',
    });
  });
});
