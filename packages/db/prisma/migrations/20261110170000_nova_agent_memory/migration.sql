CREATE TABLE "nova_agent_memory_link" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "taskId" TEXT,
    "supermemoryDocumentId" TEXT,
    "memoryType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nova_agent_memory_link_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "nova_agent_memory_link_ownerUserId_agentId_status_idx" ON "nova_agent_memory_link"("ownerUserId", "agentId", "status");
CREATE INDEX "nova_agent_memory_link_agentId_createdAt_idx" ON "nova_agent_memory_link"("agentId", "createdAt");

ALTER TABLE "nova_agent_memory_link" ADD CONSTRAINT "nova_agent_memory_link_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nova_agent_memory_link" ADD CONSTRAINT "nova_agent_memory_link_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nova_agent_memory_link" ADD CONSTRAINT "nova_agent_memory_link_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "nova_agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nova_agent_memory_link" ADD CONSTRAINT "nova_agent_memory_link_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
