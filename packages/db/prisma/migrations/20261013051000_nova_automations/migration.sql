CREATE TABLE "nova_automation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "creatorMembershipId" TEXT NOT NULL,
  "runAsMembershipId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "onlyRunWhen" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "effort" TEXT NOT NULL DEFAULT 'medium',
  "triggers" JSONB NOT NULL,
  "repositoryIds" JSONB NOT NULL,
  "maxRunsPerDay" INTEGER NOT NULL DEFAULT 10,
  "cooldownMinutes" INTEGER NOT NULL DEFAULT 5,
  "status" TEXT NOT NULL DEFAULT 'active',
  "webhookTokenHash" TEXT,
  "lastRunAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nova_automation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "nova_automation_run" (
  "id" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "event" JSONB NOT NULL,
  "snapshot" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "reason" TEXT,
  "agentSessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "nova_automation_run_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "nova_automation_organizationId_status_idx" ON "nova_automation"("organizationId", "status");
CREATE INDEX "nova_automation_creatorMembershipId_idx" ON "nova_automation"("creatorMembershipId");
CREATE INDEX "nova_automation_runAsMembershipId_idx" ON "nova_automation"("runAsMembershipId");
CREATE UNIQUE INDEX "nova_automation_run_agentSessionId_key" ON "nova_automation_run"("agentSessionId");
CREATE UNIQUE INDEX "nova_automation_run_automationId_deliveryId_key" ON "nova_automation_run"("automationId", "deliveryId");
CREATE INDEX "nova_automation_run_automationId_createdAt_idx" ON "nova_automation_run"("automationId", "createdAt");
CREATE INDEX "nova_automation_run_status_createdAt_idx" ON "nova_automation_run"("status", "createdAt");
ALTER TABLE "nova_automation" ADD CONSTRAINT "nova_automation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nova_automation" ADD CONSTRAINT "nova_automation_creatorMembershipId_fkey" FOREIGN KEY ("creatorMembershipId") REFERENCES "organization_membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nova_automation" ADD CONSTRAINT "nova_automation_runAsMembershipId_fkey" FOREIGN KEY ("runAsMembershipId") REFERENCES "organization_membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nova_automation_run" ADD CONSTRAINT "nova_automation_run_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "nova_automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nova_automation_run" ADD CONSTRAINT "nova_automation_run_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "agent_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
