import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../modules/auth/strategies/jwt.strategy';

// The session id the request authenticated with, so a handler can act on this
// session specifically rather than on every session the user has.
export const GetSessionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const sessionId = request.user?.sessionId;

    if (!sessionId) {
      throw new UnauthorizedException('No active session');
    }

    return sessionId;
  },
);
