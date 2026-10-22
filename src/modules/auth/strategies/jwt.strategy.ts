import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { User } from '@prisma/client';
import { AUTH_CONFIG, AuthConfig } from '../auth.config';
import { ACCESS_TOKEN_COOKIE } from '../auth-cookie.service';

export interface JwtPayload {
  sub: string;
  email: string;
  sid: string;
}

export interface AuthenticatedUser extends Omit<User, 'password'> {
  sessionId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(AUTH_CONFIG) config: AuthConfig,
    private readonly prisma: PrismaService,
  ) {
    super({
      // Read from the httpOnly cookie only. A Bearer header is not accepted,
      // so the token never has to be handed to page JavaScript.
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) =>
          (req?.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.accessSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Tokens issued before sessions existed carry no `sid`, so there is no row
    // to check them against and they are no longer accepted.
    if (!payload.sid) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });

    // The row decides, not the token: a correctly signed, unexpired token is
    // still rejected once its session has been revoked by logout or lapsed.
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...user } = session.user;
    return { ...user, sessionId: session.id };
  }
}
