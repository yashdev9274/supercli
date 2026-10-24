CREATE TABLE "nova_sandbox_session" (
  "id" TEXT NOT NULL,
  "agentSessionId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "repositoryFullName" TEXT NOT NULL,
  "sandboxName" TEXT NOT NULL,
  "providerSessionId" TEXT,
  "snapshotId" TEXT,
  "baseSha" TEXT,
  "branch" TEXT,
  "status" TEXT NOT NULL DEFAULT 'provisioning',
  "leaseRunId" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nova_sandbox_session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "nova_sandbox_session_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "agent_session"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "nova_sandbox_session_sandboxName_key" ON "nova_sandbox_session"("sandboxName");
CREATE UNIQUE INDEX "nova_sandbox_session_leaseRunId_key" ON "nova_sandbox_session"("leaseRunId");
CREATE UNIQUE INDEX "nova_sandbox_session_userId_agentSessionId_repositoryFullName_key" ON "nova_sandbox_session"("userId", "agentSessionId", "repositoryFullName");
CREATE INDEX "nova_sandbox_session_organizationId_leaseExpiresAt_idx" ON "nova_sandbox_session"("organizationId", "leaseExpiresAt");
CREATE INDEX "nova_sandbox_session_status_leaseExpiresAt_idx" ON "nova_sandbox_session"("status", "leaseExpiresAt");
CREATE INDEX "nova_sandbox_session_expiresAt_idx" ON "nova_sandbox_session"("expiresAt");
