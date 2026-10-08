-- CreateTable
CREATE TABLE "web_local_project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "rootName" TEXT NOT NULL,
    "pathIndex" JSONB NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "repositoryFullName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web_local_project_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "agent_session" ADD COLUMN "localProjectId" TEXT;

-- CreateIndex
CREATE INDEX "web_local_project_userId_status_lastUsedAt_idx" ON "web_local_project"("userId", "status", "lastUsedAt");

-- CreateIndex
CREATE INDEX "web_local_project_organizationId_status_idx" ON "web_local_project"("organizationId", "status");

-- CreateIndex
CREATE INDEX "agent_session_localProjectId_idx" ON "agent_session"("localProjectId");

-- AddForeignKey
ALTER TABLE "web_local_project" ADD CONSTRAINT "web_local_project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_local_project" ADD CONSTRAINT "web_local_project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_localProjectId_fkey" FOREIGN KEY ("localProjectId") REFERENCES "web_local_project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
