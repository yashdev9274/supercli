CREATE TABLE "nova_browser_session" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "agentSessionId" TEXT NOT NULL,
  "providerSessionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'provisioning',
  "control" TEXT NOT NULL DEFAULT 'user',
  "controlVersion" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "quotaUntil" TIMESTAMP(3) NOT NULL,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "screenshot" BYTEA,
  "screenshotVersion" TEXT,
  "screenshotExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nova_browser_session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "nova_browser_session_status_check" CHECK ("status" IN ('provisioning', 'active', 'releasing', 'ended')),
  CONSTRAINT "nova_browser_session_control_check" CHECK ("control" IN ('user', 'agent')),
  CONSTRAINT "nova_browser_session_image_check" CHECK (octet_length("screenshot") <= 300000)
);
CREATE UNIQUE INDEX "nova_browser_session_providerSessionId_key" ON "nova_browser_session"("providerSessionId");
CREATE UNIQUE INDEX "nova_browser_session_live_scope_key" ON "nova_browser_session"("agentSessionId", "userId") WHERE "status" <> 'ended';
CREATE INDEX "nova_browser_session_organizationId_status_quotaUntil_idx" ON "nova_browser_session"("organizationId", "status", "quotaUntil");
CREATE INDEX "nova_browser_session_agentSessionId_userId_createdAt_idx" ON "nova_browser_session"("agentSessionId", "userId", "createdAt");
ALTER TABLE "nova_browser_session" ADD CONSTRAINT "nova_browser_session_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nova_browser_session" ADD CONSTRAINT "nova_browser_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nova_browser_session" ADD CONSTRAINT "nova_browser_session_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "agent_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
