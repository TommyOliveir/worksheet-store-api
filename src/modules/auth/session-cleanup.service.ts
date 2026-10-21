import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

// Logins only prune the logging-in user's own expired rows, so sessions of
// users who never come back would pile up. This sweeps all of them. Revoked
// sessions are covered too: they expire like any other and are removed here.
@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneExpiredSessions(): Promise<number> {
    try {
      const { count } = await this.prisma.session.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      this.logger.log(`Pruned ${count} expired session(s)`);
      return count;
    } catch (error) {
      // A failed sweep is retried tomorrow; it must not crash the app.
      this.logger.error('Failed to prune expired sessions', error);
      return 0;
    }
  }
}
