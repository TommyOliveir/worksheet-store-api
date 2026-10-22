import { ConfigService } from '@nestjs/config';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

type SameSite = 'strict' | 'lax' | 'none';

export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  cookieSecure: boolean;
  cookieSameSite: SameSite;
}

// Expiry values take the shorthand jsonwebtoken accepts ("7d", "15m",
// "3600"). Tokens, cookies and session rows are all derived from the parsed
// number so they can never disagree about when something ends.
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());

  if (!match) {
    throw new Error(`Invalid duration value: "${value}"`);
  }

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return Number(match[1]) * multipliers[match[2] ?? 's'];
}

function requireSecret(config: ConfigService, key: string): string {
  const value = config.get<string>(key);
  if (!value) {
    throw new Error(`${key} environment variable is not set`);
  }
  return value;
}

export function loadAuthConfig(config: ConfigService): AuthConfig {
  const accessSecret = requireSecret(config, 'JWT_ACCESS_SECRET');
  const refreshSecret = requireSecret(config, 'JWT_REFRESH_SECRET');

  // With one shared secret a refresh token would also pass as an access
  // token, and the other way round.
  if (accessSecret === refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }

  const cookieSameSite = config
    .get<string>('COOKIE_SAME_SITE', 'strict')
    .toLowerCase();
  if (!['strict', 'lax', 'none'].includes(cookieSameSite)) {
    throw new Error(`Invalid COOKIE_SAME_SITE value: "${cookieSameSite}"`);
  }

  const secureSetting = config.get<string>('COOKIE_SECURE');
  const cookieSecure =
    secureSetting === undefined
      ? config.get<string>('NODE_ENV') === 'production'
      : secureSetting === 'true';

  // Browsers drop SameSite=None cookies that are not also Secure.
  if (cookieSameSite === 'none' && !cookieSecure) {
    throw new Error('COOKIE_SAME_SITE=none requires COOKIE_SECURE=true');
  }

  return {
    accessSecret,
    refreshSecret,
    accessTtlSeconds: parseDurationToSeconds(
      config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    ),
    refreshTtlSeconds: parseDurationToSeconds(
      config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    ),
    cookieSecure,
    cookieSameSite: cookieSameSite as SameSite,
  };
}
