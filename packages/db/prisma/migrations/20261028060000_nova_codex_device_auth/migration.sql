CREATE TABLE "nova_codex_connection" (
  "membershipId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'disconnected',
  "version" INTEGER NOT NULL DEFAULT 0,
  "attemptId" TEXT,
  "sessionHash" TEXT,
  "encryptedAttempt" TEXT,
  "encryptedCredentials" TEXT,
  "intervalSeconds" INTEGER NOT NULL DEFAULT 5,
  "expiresAt" TIMESTAMP(3),
  "nextPollAt" TIMESTAMP(3),
  "lastStartedAt" TIMESTAMP(3),
  "connectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nova_codex_connection_pkey" PRIMARY KEY ("membershipId"),
  CONSTRAINT "nova_codex_connection_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "organization_membership"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "nova_codex_connection_state_check" CHECK ("state" IN ('disconnected', 'starting', 'pending', 'polling', 'connected', 'cancelled', 'expired', 'failed'))
);
CREATE INDEX "nova_codex_connection_state_expiresAt_idx" ON "nova_codex_connection"("state", "expiresAt");
