ALTER TABLE "plan" ADD COLUMN "monthlyCredits" INTEGER NOT NULL DEFAULT 1000;
UPDATE "plan" SET "monthlyCredits" = CASE WHEN tier = 'spark' THEN 1000 ELSE "creditAmountCents" END;
UPDATE "plan" SET name = 'Free', "contextLimit" = 16000 WHERE tier = 'spark';
CREATE TABLE "credit_account" (
  "userId" TEXT PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "balanceMicrocredits" BIGINT NOT NULL CHECK ("balanceMicrocredits" >= 0),
  "allowanceMicrocredits" BIGINT NOT NULL CHECK ("allowanceMicrocredits" >= 0),
  "committedMicrocredits" BIGINT NOT NULL DEFAULT 0 CHECK ("committedMicrocredits" >= 0),
  "periodStart" TIMESTAMP(3) NOT NULL,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "credit_reservation" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "key" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('reserved', 'settled')),
  "reservedMicrocredits" BIGINT NOT NULL CHECK ("reservedMicrocredits" >= 0),
  "actualMicrocredits" BIGINT CHECK ("actualMicrocredits" >= 0 AND "actualMicrocredits" <= "reservedMicrocredits"),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "key"),
  CHECK (("status" = 'settled') = ("actualMicrocredits" IS NOT NULL))
);
CREATE INDEX "credit_reservation_userId_status_idx" ON "credit_reservation"("userId", "status");
