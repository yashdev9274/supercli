ALTER TABLE "nova_automation" ADD COLUMN "agentId" TEXT;

CREATE INDEX "nova_automation_agentId_idx" ON "nova_automation"("agentId");

ALTER TABLE "nova_automation" ADD CONSTRAINT "nova_automation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "nova_agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
