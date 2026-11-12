ALTER TABLE "agent_session" ADD COLUMN "agentId" TEXT;

CREATE INDEX "agent_session_agentId_updatedAt_idx" ON "agent_session"("agentId", "updatedAt");

ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "nova_agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
