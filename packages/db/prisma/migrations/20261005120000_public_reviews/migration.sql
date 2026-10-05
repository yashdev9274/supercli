CREATE TABLE "public_review_cache" (
  "key" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "markdown" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "public_review_cache_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "public_review_cache_status_check" CHECK ("status" IN ('pending', 'completed', 'failed'))
);

CREATE TABLE "public_review_quota" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "public_review_quota_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "public_review_quota_count_check" CHECK ("count" >= 0)
);

CREATE INDEX "public_review_cache_expiresAt_idx" ON "public_review_cache"("expiresAt");
CREATE INDEX "public_review_cache_status_leaseUntil_idx" ON "public_review_cache"("status", "leaseUntil");
CREATE INDEX "public_review_quota_expiresAt_idx" ON "public_review_quota"("expiresAt");
