CREATE TABLE "whatsapp_identity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "phoneNumberId" TEXT NOT NULL,
  "phoneE164" TEXT,
  "conversationId" TEXT,
  "businessScopedUserId" TEXT,
  "parentBusinessScopedUserId" TEXT,
  "username" TEXT,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notifyReviews" BOOLEAN NOT NULL DEFAULT true,
  "lastActiveAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_identity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_link_challenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "phoneNumberId" TEXT NOT NULL,
  "phoneE164" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "sendCount" INTEGER NOT NULL DEFAULT 1,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestIpHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_link_challenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_webhook_event" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payloadVersion" TEXT,
  "phoneNumberId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_webhook_event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_delivery" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "templateName" TEXT NOT NULL,
  "messageId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_delivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_action" (
  "id" TEXT NOT NULL,
  "externalActionKey" TEXT NOT NULL,
  "externalMessageId" TEXT,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "identityId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "authorized" BOOLEAN,
  "denialReason" TEXT,
  "githubReviewId" BIGINT,
  "error" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_action_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_identity_userId_phoneNumberId_key" ON "whatsapp_identity"("userId", "phoneNumberId");
CREATE UNIQUE INDEX "whatsapp_identity_phoneNumberId_phoneE164_key" ON "whatsapp_identity"("phoneNumberId", "phoneE164");
CREATE UNIQUE INDEX "whatsapp_identity_phoneNumberId_businessScopedUserId_key" ON "whatsapp_identity"("phoneNumberId", "businessScopedUserId");
CREATE INDEX "whatsapp_identity_phoneNumberId_parentBusinessScopedUserId_idx" ON "whatsapp_identity"("phoneNumberId", "parentBusinessScopedUserId");
CREATE INDEX "whatsapp_identity_conversationId_idx" ON "whatsapp_identity"("conversationId");
CREATE INDEX "whatsapp_link_challenge_userId_phoneNumberId_phoneE164_createdAt_idx" ON "whatsapp_link_challenge"("userId", "phoneNumberId", "phoneE164", "createdAt");
CREATE INDEX "whatsapp_link_challenge_expiresAt_idx" ON "whatsapp_link_challenge"("expiresAt");
CREATE UNIQUE INDEX "whatsapp_webhook_event_idempotencyKey_key" ON "whatsapp_webhook_event"("idempotencyKey");
CREATE INDEX "whatsapp_webhook_event_status_createdAt_idx" ON "whatsapp_webhook_event"("status", "createdAt");
CREATE INDEX "whatsapp_webhook_event_phoneNumberId_eventType_idx" ON "whatsapp_webhook_event"("phoneNumberId", "eventType");
CREATE UNIQUE INDEX "whatsapp_delivery_messageId_key" ON "whatsapp_delivery"("messageId");
CREATE UNIQUE INDEX "whatsapp_delivery_reviewId_identityId_templateName_key" ON "whatsapp_delivery"("reviewId", "identityId", "templateName");
CREATE INDEX "whatsapp_delivery_identityId_status_idx" ON "whatsapp_delivery"("identityId", "status");
CREATE UNIQUE INDEX "whatsapp_action_externalActionKey_key" ON "whatsapp_action"("externalActionKey");
CREATE INDEX "whatsapp_action_reviewId_status_idx" ON "whatsapp_action"("reviewId", "status");
CREATE INDEX "whatsapp_action_identityId_createdAt_idx" ON "whatsapp_action"("identityId", "createdAt");

ALTER TABLE "whatsapp_identity" ADD CONSTRAINT "whatsapp_identity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_link_challenge" ADD CONSTRAINT "whatsapp_link_challenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_delivery" ADD CONSTRAINT "whatsapp_delivery_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_delivery" ADD CONSTRAINT "whatsapp_delivery_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "whatsapp_identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_action" ADD CONSTRAINT "whatsapp_action_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "whatsapp_identity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_action" ADD CONSTRAINT "whatsapp_action_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
