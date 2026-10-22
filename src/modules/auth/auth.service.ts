import {
  Inject,
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Prisma, User } from '@prisma/client';
import { AUTH_CONFIG, AuthConfig } from './auth.config';
import { AuthTokens } from './auth-cookie.service';

export interface AuthResult {
  user: Omit<User, 'password'>;
  tokens: AuthTokens;
}

// Thrown when a refresh lost a race with another refresh of the same session,
// typically two tabs whose access tokens expired together. The session is
// fine and the winner's cookies are already in the browser, so the caller must
// not clear them. A 409 rather than a 401 tells the client to simply retry
// its request instead of treating the session as gone.
export class StaleRefreshTokenException extends ConflictException {
  constructor() {
    super('Refresh token was already rotated');
  }
}

// How long after a rotation a mismatching refresh token is still taken for a
// concurrent request rather than a replay of a stolen token.
const REFRESH_REUSE_GRACE_MS = 30_000;

// Compared against when no account matches the email, so a missing user and a
// wrong password take the same time to reject. Without it, response times
// disclose which emails are registered.
const ABSENT_USER_PASSWORD_HASH = bcrypt.hashSync('absent-user', 10);

// SHA-256 rather than bcrypt. A refresh token is a long random-salted JWT, not
// a guessable password, so a slow hash adds nothing; and bcrypt only reads the
// first 72 bytes, which for these JWTs is the header plus the user id, so
// every token a user was ever issued would compare equal.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashesMatch(a: string | null, b: string): boolean {
  if (!a || a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function withoutPassword(user: User): Omit<User, 'password'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...result } = user;
  return result;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async register(dto: RegisterDto, userAgent?: string): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    try {
      // Written together: a session that failed after the user was created
      // would report an error for an account that now exists, and the retry
      // would be rejected as a duplicate email with no way forward.
      return await this.prisma.$transaction(async (tx) => {
        // `role` is deliberately not read from the request. It defaults to
        // BUYER in the schema, so signup cannot be used to mint an ADMIN.
        const user = await tx.user.create({
          data: {
            email: dto.email,
            password: hashedPassword,
            fullName: dto.fullName,
          },
        });

        const tokens = await this.startSession(tx, user, userAgent);
        return { user: withoutPassword(user), tokens };
      });
    } catch (error) {
      // Two concurrent signups for the same email both clear the check above;
      // the unique index decides, and the loser reports the same conflict.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('User with this email already exists');
      }

      throw error;
    }
  }

  async login(dto: LoginDto, userAgent?: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      await bcrypt.compare(dto.password, ABSENT_USER_PASSWORD_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.startSession(this.prisma, user, userAgent);

    // Housekeeping only, and nothing depends on the outcome, so a failure
    // here must not cost the user their login.
    await this.pruneExpiredSessions(user.id).catch(() => undefined);

    return { user: withoutPassword(user), tokens };
  }

  // Exchanges the session's current refresh token for a new pair. The old
  // refresh token stops working the moment this succeeds.
  async refresh(sessionId: string, refreshToken: string): Promise<AuthResult> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    const presentedHash = hashToken(refreshToken);

    if (!hashesMatch(session.refreshTokenHash, presentedHash)) {
      const rotatedRecently =
        session.refreshedAt !== null &&
        Date.now() - session.refreshedAt.getTime() < REFRESH_REUSE_GRACE_MS;

      if (rotatedRecently) {
        throw new StaleRefreshTokenException();
      }

      // A token that was already exchanged is being presented again. Either
      // it was stolen and used, or it is being replayed now; there is no
      // telling which copy is the real user's, so the whole session ends.
      await this.revokeSession(sessionId);
      throw new UnauthorizedException('Session is no longer valid');
    }

    const tokens = await this.signTokens(session.user, sessionId);
    const rotated = await this.updateRefreshTokenHash(
      sessionId,
      presentedHash,
      tokens.refreshToken,
    );

    if (!rotated) {
      throw new StaleRefreshTokenException();
    }

    return { user: withoutPassword(session.user), tokens };
  }

  // Swaps in the hash of a newly issued refresh token, but only if the
  // session still holds `previousHash`. Of two refreshes racing with the same
  // token exactly one gets a row back; the other must not hand out tokens.
  async updateRefreshTokenHash(
    sessionId: string,
    previousHash: string,
    refreshToken: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, refreshTokenHash: previousHash, revokedAt: null },
      data: {
        refreshTokenHash: hashToken(refreshToken),
        refreshedAt: new Date(),
        // Sliding window: an active session lives on, an idle one lapses
        // REFRESH_EXPIRES_IN after its last refresh.
        expiresAt: this.sessionExpiresAt(),
      },
    });

    return count === 1;
  }

  async revokeSession(sessionId: string): Promise<void> {
    // updateMany keeps logout idempotent: revoking a session that is already
    // revoked or no longer there is a no-op rather than an error. The hash is
    // cleared as well so nothing about the row can still be refreshed.
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), refreshTokenHash: null },
    });
  }

  private async startSession(
    db: Prisma.TransactionClient,
    user: User,
    userAgent?: string,
  ): Promise<AuthTokens> {
    // The id is chosen here rather than by the database so the tokens, which
    // carry it, can be signed before the row is written, and the row is then
    // created with its refresh-token hash in a single insert.
    const sessionId = randomUUID();
    const tokens = await this.signTokens(user, sessionId);

    await db.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        expiresAt: this.sessionExpiresAt(),
        userAgent,
        refreshTokenHash: hashToken(tokens.refreshToken),
      },
    });

    return tokens;
  }

  private async signTokens(user: User, sessionId: string): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: user.id, email: user.email, sid: sessionId },
        {
          secret: this.config.accessSecret,
          expiresIn: this.config.accessTtlSeconds,
        },
      ),
      // `jti` makes every refresh token unique. Without it two refreshes in
      // the same second would produce identical tokens, and the one already
      // used would still match the stored hash.
      this.jwtService.signAsync(
        { sub: user.id, sid: sessionId, jti: randomUUID() },
        {
          secret: this.config.refreshSecret,
          expiresIn: this.config.refreshTtlSeconds,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private sessionExpiresAt(): Date {
    return new Date(Date.now() + this.config.refreshTtlSeconds * 1000);
  }

  private async pruneExpiredSessions(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
  }
}
