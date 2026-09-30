-- CreateTable
CREATE TABLE "review_run" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "reviewId" TEXT,
    "prNumber" INTEGER NOT NULL,
    "headSha" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "failure" TEXT,
    "reservedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_credit_period" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "allocation" INTEGER NOT NULL DEFAULT 20,
    "usedCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_credit_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_credit_entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "reviewRunId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_credit_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_run_userId_repositoryId_prNumber_headSha_key" ON "review_run"("userId", "repositoryId", "prNumber", "headSha");
CREATE INDEX "review_run_userId_createdAt_idx" ON "review_run"("userId", "createdAt");
CREATE INDEX "review_run_repositoryId_prNumber_createdAt_idx" ON "review_run"("repositoryId", "prNumber", "createdAt");
CREATE INDEX "review_run_status_updatedAt_idx" ON "review_run"("status", "updatedAt");
CREATE UNIQUE INDEX "review_credit_period_userId_periodStart_key" ON "review_credit_period"("userId", "periodStart");
CREATE INDEX "review_credit_period_userId_periodEnd_idx" ON "review_credit_period"("userId", "periodEnd");
CREATE UNIQUE INDEX "review_credit_entry_idempotencyKey_key" ON "review_credit_entry"("idempotencyKey");
CREATE INDEX "review_credit_entry_userId_createdAt_idx" ON "review_credit_entry"("userId", "createdAt");
CREATE INDEX "review_credit_entry_periodId_kind_idx" ON "review_credit_entry"("periodId", "kind");
CREATE INDEX "review_credit_entry_reviewRunId_createdAt_idx" ON "review_credit_entry"("reviewRunId", "createdAt");

-- AddForeignKey
ALTER TABLE "review_run" ADD CONSTRAINT "review_run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_run" ADD CONSTRAINT "review_run_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_run" ADD CONSTRAINT "review_run_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "review"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "review_credit_period" ADD CONSTRAINT "review_credit_period_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_credit_entry" ADD CONSTRAINT "review_credit_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_credit_entry" ADD CONSTRAINT "review_credit_entry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "review_credit_period"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_credit_entry" ADD CONSTRAINT "review_credit_entry_reviewRunId_fkey" FOREIGN KEY ("reviewRunId") REFERENCES "review_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
