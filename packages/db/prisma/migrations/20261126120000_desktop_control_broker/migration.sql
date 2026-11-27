CREATE TABLE "desktop_control_enrollment" (
  "id" TEXT NOT NULL, "codeHash" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL, "membershipId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "desktop_control_enrollment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "desktop_control_enrollment_codeHash_key" ON "desktop_control_enrollment"("codeHash");
CREATE INDEX "desktop_control_enrollment_expiresAt_idx" ON "desktop_control_enrollment"("expiresAt");
CREATE TABLE "desktop_control_nonce" (
  "deviceId" TEXT NOT NULL, "nonceHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "desktop_control_nonce_pkey" PRIMARY KEY ("deviceId", "nonceHash")
);
CREATE TABLE "desktop_control_device" (
  "deviceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "organizationId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL, "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "desktop_control_device_pkey" PRIMARY KEY ("deviceId")
);
CREATE INDEX "desktop_control_device_userId_organizationId_idx" ON "desktop_control_device"("userId", "organizationId");
CREATE TABLE "desktop_control_command" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "membershipId" TEXT NOT NULL,
  "userId" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "sessionId" TEXT NOT NULL,
  "runId" TEXT NOT NULL, "invocationId" TEXT NOT NULL, "argsHash" TEXT NOT NULL, "invocationHash" TEXT NOT NULL,
  "toolName" TEXT NOT NULL, "capability" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued', "fenceHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL, "claimedAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3), "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "desktop_control_command_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "desktop_control_command_invocationId_key" ON "desktop_control_command"("invocationId");
CREATE INDEX "desktop_control_command_deviceId_status_expiresAt_idx" ON "desktop_control_command"("deviceId", "status", "expiresAt");
