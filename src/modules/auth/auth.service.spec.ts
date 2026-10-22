import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { User } from '@prisma/client';
import { AuthService, StaleRefreshTokenException } from './auth.service';
import { AuthConfig } from './auth.config';
import { PrismaService } from '../../prisma/prisma.service';

const config: AuthConfig = {
  accessSecret: 'access-secret',
  refreshSecret: 'refresh-secret',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 604800,
  cookieSecure: false,
  cookieSameSite: 'strict',
};

const user: User = {
  id: 'user-1',
  email: 'a@example.com',
  password: 'hashed',
  fullName: 'A User',
  role: 'BUYER',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    userId: user.id,
    user,
    userAgent: null,
    refreshTokenHash: sha256('current-token'),
    refreshedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function setup(session: ReturnType<typeof sessionRow> | null) {
  const prisma = {
    session: {
      findUnique: vi.fn().mockResolvedValue(session),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const jwt = new JwtService();
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt,
    config,
  );
  return { prisma, jwt, service };
}

describe('AuthService.refresh', () => {
  it('rotates the pair and stores the hash of the new refresh token', async () => {
    const { prisma, jwt, service } = setup(sessionRow());

    const { user: returned, tokens } = await service.refresh(
      'session-1',
      'current-token',
    );

    expect(returned).not.toHaveProperty('password');
    expect(
      jwt.verify(tokens.accessToken, { secret: config.accessSecret }),
    ).toMatchObject({ sub: user.id, sid: 'session-1' });
    expect(
      jwt.verify(tokens.refreshToken, { secret: config.refreshSecret }),
    ).toMatchObject({ sub: user.id, sid: 'session-1' });

    const [update] = prisma.session.updateMany.mock.calls[0];
    // Conditional on the old hash, so a second refresh with it cannot win.
    expect(update.where).toMatchObject({
      id: 'session-1',
      refreshTokenHash: sha256('current-token'),
      revokedAt: null,
    });
    expect(update.data.refreshTokenHash).toBe(sha256(tokens.refreshToken));
  });

  it('issues a different refresh token each time', async () => {
    const { service } = setup(sessionRow());

    const first = await service.refresh('session-1', 'current-token');
    const second = await service.refresh('session-1', 'current-token');

    expect(first.tokens.refreshToken).not.toBe(second.tokens.refreshToken);
  });

  it('revokes the session when an already-used token is replayed', async () => {
    const { prisma, service } = setup(
      sessionRow({ refreshedAt: new Date(Date.now() - 60_000) }),
    );

    const attempt = service.refresh('session-1', 'old-token');

    await expect(attempt).rejects.toThrow(UnauthorizedException);
    await expect(attempt).rejects.not.toThrow(StaleRefreshTokenException);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', revokedAt: null },
      data: { revokedAt: expect.any(Date), refreshTokenHash: null },
    });
  });

  it('treats a mismatch right after a rotation as a race, not a replay', async () => {
    const { prisma, service } = setup(
      sessionRow({ refreshedAt: new Date(Date.now() - 1_000) }),
    );

    await expect(service.refresh('session-1', 'old-token')).rejects.toThrow(
      StaleRefreshTokenException,
    );
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('reports a lost conditional update as a race', async () => {
    const { prisma, service } = setup(sessionRow());
    prisma.session.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.refresh('session-1', 'current-token')).rejects.toThrow(
      StaleRefreshTokenException,
    );
  });

  it.each([
    ['missing', null],
    ['revoked', sessionRow({ revokedAt: new Date() })],
    ['expired', sessionRow({ expiresAt: new Date(Date.now() - 1) })],
  ])('rejects a %s session', async (_label, session) => {
    const { prisma, service } = setup(session);

    await expect(service.refresh('session-1', 'current-token')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });
});
