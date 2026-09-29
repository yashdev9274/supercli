-- CreateTable
CREATE TABLE "organization_membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'active',
    "capabilities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_installation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "externalAccountName" TEXT,
    "botExternalUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "grantedScopes" JSONB,
    "missingScopes" JSONB,
    "webhookStatus" TEXT NOT NULL DEFAULT 'pending',
    "credentialRef" TEXT,
    "config" JSONB,
    "installedAt" TIMESTAMP(3),
    "lastHealthCheckAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_delegated_connection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "installationId" TEXT,
    "provider" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "grantedScopes" JSONB,
    "credentialRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_delegated_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_identity" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'verified',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_session" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "initiatorMembershipId" TEXT,
    "objective" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'chat',
    "status" TEXT NOT NULL DEFAULT 'active',
    "policySnapshot" JSONB,
    "contextVersion" INTEGER NOT NULL DEFAULT 1,
    "budget" JSONB,
    "nextSequence" INTEGER NOT NULL DEFAULT 1,
    "activeRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "agent_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_surface" (
    "id" TEXT NOT NULL,
    "agentSessionId" TEXT NOT NULL,
    "installationId" TEXT,
    "provider" TEXT NOT NULL,
    "surfaceKey" TEXT NOT NULL,
    "externalSurfaceId" TEXT NOT NULL,
    "externalContainerId" TEXT,
    "externalUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_surface_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_session_message" (
    "id" TEXT NOT NULL,
    "agentSessionId" TEXT NOT NULL,
    "surfaceId" TEXT,
    "sequence" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "senderType" TEXT,
    "senderId" TEXT,
    "originEventId" TEXT,
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_session_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_activity" (
    "id" TEXT NOT NULL,
    "agentSessionId" TEXT NOT NULL,
    "surfaceId" TEXT,
    "runId" TEXT,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "title" TEXT,
    "body" TEXT,
    "data" JSONB,
    "visibility" TEXT NOT NULL DEFAULT 'company',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "installationId" TEXT,
    "agentSessionId" TEXT,
    "surfaceId" TEXT,
    "provider" TEXT NOT NULL,
    "providerDeliveryId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorExternalId" TEXT,
    "payload" JSONB NOT NULL,
    "payloadVersion" TEXT NOT NULL DEFAULT '1',
    "verificationState" TEXT NOT NULL DEFAULT 'verified',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run" (
    "id" TEXT NOT NULL,
    "agentSessionId" TEXT NOT NULL,
    "parentRunId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "executionTarget" TEXT NOT NULL DEFAULT 'none',
    "desktopDeviceId" TEXT,
    "policySnapshot" JSONB,
    "budget" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "cancellationAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_invocation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "riskClass" TEXT NOT NULL,
    "normalizedArgsHash" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_invocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_request" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "toolInvocationId" TEXT,
    "approverMembershipId" TEXT,
    "capability" TEXT NOT NULL,
    "normalizedArgsHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nova_artifact" (
    "id" TEXT NOT NULL,
    "agentSessionId" TEXT NOT NULL,
    "runId" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uri" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nova_artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempt" (
    "id" TEXT NOT NULL,
    "installationId" TEXT,
    "activityId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "externalId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "error" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nova_outbox_event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentSessionId" TEXT,
    "topic" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nova_outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nova_audit_event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentSessionId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "decision" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nova_audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nova_usage_ledger" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentSessionId" TEXT,
    "runId" TEXT,
    "kind" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "reservationKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nova_usage_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desktop_device" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "devicePublicId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "appVersion" TEXT,
    "publicKey" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "desktop_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_binding" (
    "id" TEXT NOT NULL,
    "desktopDeviceId" TEXT NOT NULL,
    "opaqueBindingId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "repositoryFullName" TEXT,
    "repositoryId" TEXT,
    "gitRemoteHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_binding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capability_lease" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "desktopDeviceId" TEXT NOT NULL,
    "workspaceBindingId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "constraints" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capability_lease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_membership_userId_status_idx" ON "organization_membership"("userId", "status");

-- CreateIndex
CREATE INDEX "organization_membership_organizationId_role_idx" ON "organization_membership"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "organization_membership_organizationId_userId_key" ON "organization_membership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "external_installation_organizationId_provider_status_idx" ON "external_installation"("organizationId", "provider", "status");

-- CreateIndex
CREATE INDEX "external_installation_provider_externalAccountId_idx" ON "external_installation"("provider", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "external_installation_organizationId_provider_externalAccou_key" ON "external_installation"("organizationId", "provider", "externalAccountId");

-- CreateIndex
CREATE INDEX "user_delegated_connection_organizationId_provider_status_idx" ON "user_delegated_connection"("organizationId", "provider", "status");

-- CreateIndex
CREATE INDEX "user_delegated_connection_installationId_idx" ON "user_delegated_connection"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "user_delegated_connection_membershipId_provider_externalAcc_key" ON "user_delegated_connection"("membershipId", "provider", "externalAccountId");

-- CreateIndex
CREATE INDEX "external_identity_membershipId_provider_idx" ON "external_identity"("membershipId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "external_identity_installationId_externalUserId_key" ON "external_identity"("installationId", "externalUserId");

-- CreateIndex
CREATE INDEX "agent_session_organizationId_status_updatedAt_idx" ON "agent_session"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "agent_session_initiatorMembershipId_idx" ON "agent_session"("initiatorMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "session_surface_surfaceKey_key" ON "session_surface"("surfaceKey");

-- CreateIndex
CREATE INDEX "session_surface_provider_externalSurfaceId_installationId_idx" ON "session_surface"("provider", "externalSurfaceId", "installationId");

-- CreateIndex
CREATE INDEX "session_surface_agentSessionId_status_idx" ON "session_surface"("agentSessionId", "status");

-- CreateIndex
CREATE INDEX "session_surface_installationId_idx" ON "session_surface"("installationId");

-- CreateIndex
CREATE INDEX "agent_session_message_agentSessionId_createdAt_idx" ON "agent_session_message"("agentSessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_session_message_agentSessionId_sequence_key" ON "agent_session_message"("agentSessionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "agent_session_message_surfaceId_externalId_key" ON "agent_session_message"("surfaceId", "externalId");

-- CreateIndex
CREATE INDEX "agent_activity_runId_createdAt_idx" ON "agent_activity"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "agent_activity_agentSessionId_sequence_key" ON "agent_activity"("agentSessionId", "sequence");

-- CreateIndex
CREATE INDEX "inbound_event_status_receivedAt_idx" ON "inbound_event"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "inbound_event_organizationId_provider_eventType_idx" ON "inbound_event"("organizationId", "provider", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_event_provider_providerDeliveryId_key" ON "inbound_event"("provider", "providerDeliveryId");

-- CreateIndex
CREATE INDEX "agent_run_agentSessionId_status_createdAt_idx" ON "agent_run"("agentSessionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "agent_run_desktopDeviceId_status_idx" ON "agent_run"("desktopDeviceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tool_invocation_idempotencyKey_key" ON "tool_invocation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "tool_invocation_runId_status_createdAt_idx" ON "tool_invocation"("runId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "approval_request_tokenHash_key" ON "approval_request"("tokenHash");

-- CreateIndex
CREATE INDEX "approval_request_runId_status_idx" ON "approval_request"("runId", "status");

-- CreateIndex
CREATE INDEX "approval_request_approverMembershipId_status_idx" ON "approval_request"("approverMembershipId", "status");

-- CreateIndex
CREATE INDEX "nova_artifact_agentSessionId_type_createdAt_idx" ON "nova_artifact"("agentSessionId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "nova_artifact_runId_idx" ON "nova_artifact"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_attempt_idempotencyKey_key" ON "delivery_attempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "delivery_attempt_status_nextAttemptAt_idx" ON "delivery_attempt"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "delivery_attempt_activityId_idx" ON "delivery_attempt"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "nova_outbox_event_idempotencyKey_key" ON "nova_outbox_event"("idempotencyKey");

-- CreateIndex
CREATE INDEX "nova_outbox_event_status_availableAt_idx" ON "nova_outbox_event"("status", "availableAt");

-- CreateIndex
CREATE INDEX "nova_outbox_event_organizationId_topic_idx" ON "nova_outbox_event"("organizationId", "topic");

-- CreateIndex
CREATE INDEX "nova_audit_event_organizationId_createdAt_idx" ON "nova_audit_event"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "nova_audit_event_agentSessionId_createdAt_idx" ON "nova_audit_event"("agentSessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "nova_usage_ledger_reservationKey_key" ON "nova_usage_ledger"("reservationKey");

-- CreateIndex
CREATE INDEX "nova_usage_ledger_organizationId_createdAt_idx" ON "nova_usage_ledger"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "nova_usage_ledger_runId_kind_idx" ON "nova_usage_ledger"("runId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "desktop_device_devicePublicId_key" ON "desktop_device"("devicePublicId");

-- CreateIndex
CREATE INDEX "desktop_device_organizationId_status_lastSeenAt_idx" ON "desktop_device"("organizationId", "status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "desktop_device_userId_idx" ON "desktop_device"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_binding_opaqueBindingId_key" ON "workspace_binding"("opaqueBindingId");

-- CreateIndex
CREATE INDEX "workspace_binding_desktopDeviceId_status_idx" ON "workspace_binding"("desktopDeviceId", "status");

-- CreateIndex
CREATE INDEX "workspace_binding_repositoryId_idx" ON "workspace_binding"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "capability_lease_tokenHash_key" ON "capability_lease"("tokenHash");

-- CreateIndex
CREATE INDEX "capability_lease_runId_status_idx" ON "capability_lease"("runId", "status");

-- CreateIndex
CREATE INDEX "capability_lease_desktopDeviceId_expiresAt_idx" ON "capability_lease"("desktopDeviceId", "expiresAt");

-- Backfill current single-organization users as active owners before membership foreign keys are used.
INSERT INTO "organization_membership" ("id", "organizationId", "userId", "role", "status", "createdAt", "updatedAt")
SELECT
    'owner_' || md5(u."organizationId" || ':' || u."id"),
    u."organizationId",
    u."id",
    'owner',
    'active',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "user" u
WHERE u."organizationId" IS NOT NULL
ON CONFLICT ("organizationId", "userId") DO UPDATE
SET "status" = 'active', "updatedAt" = CURRENT_TIMESTAMP;

-- AddForeignKey
ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_installation" ADD CONSTRAINT "external_installation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_delegated_connection" ADD CONSTRAINT "user_delegated_connection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_delegated_connection" ADD CONSTRAINT "user_delegated_connection_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "organization_membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_delegated_connection" ADD CONSTRAINT "user_delegated_connection_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "external_installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identity" ADD CONSTRAINT "external_identity_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "organization_membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identity" ADD CONSTRAINT "external_identity_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "external_installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_initiatorMembershipId_fkey" FOREIGN KEY ("initiatorMembershipId") REFERENCES "organization_membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_surface" ADD CONSTRAINT "session_surface_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "agent_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_surface" ADD CONSTRAINT "session_surface_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "external_installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_session_message" ADD CONSTRAINT "agent_session_message_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "agent_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_session_message" ADD CONSTRAINT "agent_session_message_surfaceId_fkey" FOREIGN KEY ("surfaceId") REFERENCES "session_surface"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activity" ADD CONSTRAINT "agent_activity_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "agent_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activity" ADD CONSTRAINT "agent_activity_surfaceId_fkey" FOREIGN KEY ("surfaceId") REFERENCES "session_surface"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activity" ADD CONSTRAINT "agent_activity_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_event" ADD CONSTRAINT "inbound_event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_event" ADD CONSTRAINT "inbound_event_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "external_installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_event" ADD CONSTRAINT "inbound_event_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "agent_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_event" ADD CONSTRAINT "inbound_event_surfaceId_fkey" FOREIGN KEY ("surfaceId") REFERENCES "session_surface"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "agent_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_desktopDeviceId_fkey" FOREIGN KEY ("desktopDeviceId") REFERENCES "desktop_device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_invocation" ADD CONSTRAINT "tool_invocation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_toolInvocationId_fkey" FOREIGN KEY ("toolInvocationId") REFERENCES "tool_invocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nova_artifact" ADD CONSTRAINT "nova_artifact_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "agent_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nova_artifact" ADD CONSTRAINT "nova_artifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempt" ADD CONSTRAINT "delivery_attempt_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "external_installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempt" ADD CONSTRAINT "delivery_attempt_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "agent_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nova_outbox_event" ADD CONSTRAINT "nova_outbox_event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nova_outbox_event" ADD CONSTRAINT "nova_outbox_event_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "agent_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nova_audit_event" ADD CONSTRAINT "nova_audit_event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nova_audit_event" ADD CONSTRAINT "nova_audit_event_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "agent_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nova_usage_ledger" ADD CONSTRAINT "nova_usage_ledger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nova_usage_ledger" ADD CONSTRAINT "nova_usage_ledger_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "agent_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nova_usage_ledger" ADD CONSTRAINT "nova_usage_ledger_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desktop_device" ADD CONSTRAINT "desktop_device_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desktop_device" ADD CONSTRAINT "desktop_device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_binding" ADD CONSTRAINT "workspace_binding_desktopDeviceId_fkey" FOREIGN KEY ("desktopDeviceId") REFERENCES "desktop_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_lease" ADD CONSTRAINT "capability_lease_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_lease" ADD CONSTRAINT "capability_lease_desktopDeviceId_fkey" FOREIGN KEY ("desktopDeviceId") REFERENCES "desktop_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_lease" ADD CONSTRAINT "capability_lease_workspaceBindingId_fkey" FOREIGN KEY ("workspaceBindingId") REFERENCES "workspace_binding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
