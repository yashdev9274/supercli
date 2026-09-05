-- CreateTable
CREATE TABLE "vercel_installation" (
    "id" TEXT NOT NULL,
    "vercelAccountId" TEXT NOT NULL,
    "organizationId" TEXT,
    "accessToken" TEXT,
    "tokenType" TEXT,
    "billingPlanId" TEXT NOT NULL DEFAULT 'free',
    "notification" JSONB,
    "rawPayload" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vercel_installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vercel_resource" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL DEFAULT 'supercode-review',
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "billingPlanId" TEXT NOT NULL DEFAULT 'free',
    "metadata" JSONB,
    "notification" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vercel_resource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vercel_installation_organizationId_idx" ON "vercel_installation"("organizationId");

-- CreateIndex
CREATE INDEX "vercel_installation_vercelAccountId_idx" ON "vercel_installation"("vercelAccountId");

-- CreateIndex
CREATE INDEX "vercel_resource_installationId_idx" ON "vercel_resource"("installationId");

-- CreateIndex
CREATE INDEX "vercel_resource_productId_idx" ON "vercel_resource"("productId");

-- AddForeignKey
ALTER TABLE "vercel_installation" ADD CONSTRAINT "vercel_installation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vercel_resource" ADD CONSTRAINT "vercel_resource_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "vercel_installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
