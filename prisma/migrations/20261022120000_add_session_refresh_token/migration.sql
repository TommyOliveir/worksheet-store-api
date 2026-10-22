-- Refresh-token rotation. Sessions created before this have no hash, so they
-- cannot be refreshed and their holders sign in again.
ALTER TABLE "Session" ADD COLUMN "refreshTokenHash" TEXT;
ALTER TABLE "Session" ADD COLUMN "refreshedAt" TIMESTAMP(3);
