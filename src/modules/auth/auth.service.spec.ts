import { describe, expect, it, vi } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { Prisma, User } from '@prisma/client';
import { AuthService, StaleRefreshTokenException } from './auth.service';
import { AuthConfig } from './auth.config';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleIdentity, GoogleTokenVerifier } from './google-token.verifier';

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
  googleId: null,
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

const googleIdentity: GoogleIdentity = {
  googleId: 'google-sub-1',
  email: 'a@example.com',
  emailVerified: true,
  fullName: 'A User',
};

function setup(session: ReturnType<typeof sessionRow> | null) {
  const prisma = {
    session: {
      findUnique: vi.fn().mockResolvedValue(session),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      create: vi.fn(),
    },
    // Runs the callback against the same mock, standing in for a real
    // transaction client.
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  const googleVerifier = {
    verify: vi.fn().mockResolvedValue(googleIdentity),
  };
  const jwt = new JwtService();
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt,
    config,
    googleVerifier as unknown as GoogleTokenVerifier,
  );
  return { prisma, jwt, service, googleVerifier };
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

describe('AuthService.googleLogin', () => {
  const dto = { credential: 'google-id-token' };

  it('creates a BUYER account without a password on first sign-in', async () => {
    const { prisma, service } = setup(null);
    const created = { ...user, password: null, googleId: 'google-sub-1' };
    prisma.user.create.mockResolvedValue(created);

    const { user: returned, tokens } = await service.googleLogin(dto);

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'a@example.com',
        fullName: 'A User',
        googleId: 'google-sub-1',
      },
    });
    expect(returned).not.toHaveProperty('password');
    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(prisma.session.create).toHaveBeenCalledOnce();
  });

  it('signs in an account already linked to the Google id', async () => {
    const { prisma, service } = setup(null);
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      googleId: 'google-sub-1',
    });

    const { user: returned } = await service.googleLogin(dto);

    expect(returned.id).toBe(user.id);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('links an existing password account with the same email', async () => {
    const { prisma, service } = setup(null);
    prisma.user.findFirst.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue({ ...user, googleId: 'google-sub-1' });

    const { user: returned } = await service.googleLogin(dto);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { googleId: 'google-sub-1' },
    });
    expect(returned.id).toBe(user.id);
  });

  it('refuses an email already linked to another Google account', async () => {
    const { prisma, service } = setup(null);
    prisma.user.findFirst.mockResolvedValue({
      ...user,
      googleId: 'other-google-sub',
    });

    await expect(service.googleLogin(dto)).rejects.toThrow(ConflictException);
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('rejects a Google account whose email is not verified', async () => {
    const { prisma, service, googleVerifier } = setup(null);
    googleVerifier.verify.mockResolvedValue({
      ...googleIdentity,
      emailVerified: false,
    });

    await expect(service.googleLogin(dto)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('retries once when a concurrent sign-in created the account first', async () => {
    const { prisma, service } = setup(null);
    const linked = { ...user, googleId: 'google-sub-1' };
    prisma.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(linked);

    const { user: returned } = await service.googleLogin(dto);

    expect(returned.id).toBe(user.id);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});

describe('AuthService.login', () => {
  it('rejects a password login for a Google-only account', async () => {
    const { prisma, service } = setup(null);
    prisma.user.findUnique.mockResolvedValue({ ...user, password: null });

    // The same message as a wrong password, rather than bcrypt throwing on
    // the missing hash.
    await expect(
      service.login({ email: user.email, password: 'anything' }),
    ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});
