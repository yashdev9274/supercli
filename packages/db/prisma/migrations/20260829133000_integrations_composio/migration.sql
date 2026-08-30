-- Idempotent: ensure Composio columns exist and drop any leftover direct OAuth secrets
ALTER TABLE "integration" ADD COLUMN IF NOT EXISTS "composioConnectedAccountId" TEXT;
ALTER TABLE "integration" ADD COLUMN IF NOT EXISTS "composioEntityId" TEXT;
ALTER TABLE "integration" DROP COLUMN IF EXISTS "slackBotToken";
ALTER TABLE "integration" DROP COLUMN IF EXISTS "slackUserId";
ALTER TABLE "integration" DROP COLUMN IF EXISTS "linearApiKey";
CREATE INDEX IF NOT EXISTS "integration_composioConnectedAccountId_idx" ON "integration"("composioConnectedAccountId");
