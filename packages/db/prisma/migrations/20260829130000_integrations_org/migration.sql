-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "composioConnectedAccountId" TEXT,
    "composioEntityId" TEXT,
    "slackTeamId" TEXT,
    "slackTeamName" TEXT,
    "slackChannelId" TEXT,
    "linearTeamId" TEXT,
    "linearTeamName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "channelId" TEXT,
    "userId" TEXT,
    "reviewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

-- AlterTable
ALTER TABLE "repository" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_organizationId_idx" ON "user"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "repository_organizationId_idx" ON "repository"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "integration_organizationId_idx" ON "integration"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "integration_composioConnectedAccountId_idx" ON "integration"("composioConnectedAccountId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "integration_organizationId_provider_key" ON "integration"("organizationId", "provider");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversation_organizationId_idx" ON "conversation"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversation_reviewId_idx" ON "conversation"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_organizationId_provider_externalId_key" ON "conversation"("organizationId", "provider", "externalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "message_conversationId_idx" ON "message"("conversationId");

-- AddForeignKey (guarded via DO blocks would be ideal; plain for prisma migrate history)
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_organizationId_fkey";
ALTER TABLE "user" ADD CONSTRAINT "user_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "repository" DROP CONSTRAINT IF EXISTS "repository_organizationId_fkey";
ALTER TABLE "repository" ADD CONSTRAINT "repository_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "integration" DROP CONSTRAINT IF EXISTS "integration_organizationId_fkey";
ALTER TABLE "integration" ADD CONSTRAINT "integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation" DROP CONSTRAINT IF EXISTS "conversation_organizationId_fkey";
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation" DROP CONSTRAINT IF EXISTS "conversation_reviewId_fkey";
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "review"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "message" DROP CONSTRAINT IF EXISTS "message_conversationId_fkey";
ALTER TABLE "message" ADD CONSTRAINT "message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
