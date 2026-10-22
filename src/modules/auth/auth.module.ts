import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthCookieService } from './auth-cookie.service';
import { AUTH_CONFIG, loadAuthConfig } from './auth.config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { SessionCleanupService } from './session-cleanup.service';

@Module({
  imports: [
    PassportModule,
    // No default secret: access and refresh tokens are signed with different
    // ones, so every sign call names its own.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_CONFIG,
      useFactory: loadAuthConfig,
      inject: [ConfigService],
    },
    AuthService,
    AuthCookieService,
    JwtStrategy,
    JwtRefreshStrategy,
    SessionCleanupService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
