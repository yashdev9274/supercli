ALTER TABLE "nova_sandbox_session"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'vercel',
  ADD COLUMN "providerSandboxId" TEXT;

DROP INDEX "nova_sandbox_session_userId_agentSessionId_repositoryFullName_key";
CREATE UNIQUE INDEX "nova_sandbox_workspace_provider_key"
  ON "nova_sandbox_session"("userId", "agentSessionId", "repositoryFullName", "provider");
