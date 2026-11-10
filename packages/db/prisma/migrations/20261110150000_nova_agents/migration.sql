CREATE TABLE "nova_agent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "instructions" TEXT NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "nova_agent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "nova_agent_organizationId_ownerUserId_status_updatedAt_idx" ON "nova_agent"("organizationId", "ownerUserId", "status", "updatedAt");
CREATE INDEX "nova_agent_ownerUserId_createdAt_idx" ON "nova_agent"("ownerUserId", "createdAt");

ALTER TABLE "nova_agent" ADD CONSTRAINT "nova_agent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nova_agent" ADD CONSTRAINT "nova_agent_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
