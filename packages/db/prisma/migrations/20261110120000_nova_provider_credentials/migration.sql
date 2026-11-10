CREATE TABLE "nova_provider_credential" (
    "membershipId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nova_provider_credential_pkey" PRIMARY KEY ("membershipId", "provider")
);

CREATE INDEX "nova_provider_credential_provider_status_idx" ON "nova_provider_credential"("provider", "status");

ALTER TABLE "nova_provider_credential" ADD CONSTRAINT "nova_provider_credential_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "organization_membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
