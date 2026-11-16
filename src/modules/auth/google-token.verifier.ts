import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { AUTH_CONFIG, AuthConfig } from './auth.config';

export interface GoogleIdentity {
  googleId: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
}

// Checks a Google ID token's signature, expiry, issuer and audience, and
// reduces it to the fields the auth service needs. It is a provider of its own
// so the service can be tested without real Google tokens.
@Injectable()
export class GoogleTokenVerifier {
  // No client secret is needed: verifying an ID token only takes Google's
  // public signing keys, which the client fetches and caches itself.
  private readonly client = new OAuth2Client();

  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    const audience = this.config.googleClientId;
    if (!audience) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    let payload;
    try {
      // `audience` matters: without it a token issued to any other Google
      // client would be accepted here.
      const ticket = await this.client.verifyIdToken({ idToken, audience });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Google credential');
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      fullName: payload.name || payload.email,
    };
  }
}
