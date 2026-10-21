import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Prisma, User } from '@prisma/client';

export interface AuthResponse {
  accessToken: string;
  user: Omit<User, 'password'>;
}

// JWT_EXPIRES_IN takes the shorthand jsonwebtoken accepts ("7d", "15m",
// "3600"). Both the token and its session row are derived from this one value
// so they can never disagree about when the session ends.
function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());

  if (!match) {
    throw new Error(`Invalid JWT_EXPIRES_IN value: "${value}"`);
  }

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return Number(match[1]) * multipliers[match[2] ?? 's'];
}

// Compared against when no account matches the email, so a missing user and a
// wrong password take the same time to reject. Without it, response times
// disclose which emails are registered.
const ABSENT_USER_PASSWORD_HASH = bcrypt.hashSync('absent-user', 10);

@Injectable()
export class AuthService {
  private readonly sessionTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.sessionTtlSeconds = parseDurationToSeconds(
      configService.get<string>('JWT_EXPIRES_IN', '7d'),
    );
  }

  async register(dto: RegisterDto, userAgent?: string): Promise<AuthResponse> {
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
      const { user, sessionId } = await this.prisma.$transaction(async (tx) => {
        // `role` is deliberately not read from the request. It defaults to
        // BUYER in the schema, so signup cannot be used to mint an ADMIN.
        const created = await tx.user.create({
          data: {
            email: dto.email,
            password: hashedPassword,
            fullName: dto.fullName,
          },
        });

        const session = await tx.session.create({
          data: {
            userId: created.id,
            expiresAt: this.sessionExpiresAt(),
            userAgent,
          },
        });

        return { user: created, sessionId: session.id };
      });

      return this.buildAuthResponse(user, sessionId);
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

  async login(dto: LoginDto, userAgent?: string): Promise<AuthResponse> {
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

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: this.sessionExpiresAt(),
        userAgent,
      },
    });

    // Housekeeping only, and nothing depends on the outcome, so a failure
    // here must not cost the user their login.
    await this.pruneExpiredSessions(user.id).catch(() => undefined);

    return this.buildAuthResponse(user, session.id);
  }

  async revokeSession(sessionId: string): Promise<void> {
    // updateMany keeps logout idempotent: revoking a session that is already
    // revoked or no longer there is a no-op rather than an error.
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private sessionExpiresAt(): Date {
    return new Date(Date.now() + this.sessionTtlSeconds * 1000);
  }

  private buildAuthResponse(user: User, sessionId: string): AuthResponse {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...result } = user;

    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, sid: sessionId },
      { expiresIn: this.sessionTtlSeconds },
    );

    return { accessToken, user: result };
  }

  private async pruneExpiredSessions(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
  }
}
