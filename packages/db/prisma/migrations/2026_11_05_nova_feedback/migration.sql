-- CreateTable nova_feedback
CREATE TABLE "nova_feedback" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "agentSessionId" TEXT,
  "runId" TEXT,
  "userMessageId" TEXT,
  "userId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'turn',
  "severity" TEXT NOT NULL DEFAULT 'info',
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "userRating" INTEGER,
  "userComment" TEXT,
  "metadata" JSONB,
  "status" TEXT NOT NULL DEFAULT 'new',
  "issueNumber" INTEGER,
  "issueUrl" TEXT,
  "promotedAt" TIMESTAMP(3),
  "dedupeKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "nova_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable nova_feedback_event
CREATE TABLE "nova_feedback_event" (
  "id" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "event" TEXT NOT NULL,
  "ts" TIMESTAMP(3) NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nova_feedback_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nova_feedback_dedupeKey_key" ON "nova_feedback"("dedupeKey");
CREATE INDEX "nova_feedback_organizationId_status_createdAt_idx" ON "nova_feedback"("organizationId", "status", "createdAt");
CREATE INDEX "nova_feedback_agentSessionId_createdAt_idx" ON "nova_feedback"("agentSessionId", "createdAt");
CREATE INDEX "nova_feedback_runId_idx" ON "nova_feedback"("runId");
CREATE INDEX "nova_feedback_userId_createdAt_idx" ON "nova_feedback"("userId", "createdAt");
CREATE INDEX "nova_feedback_status_severity_idx" ON "nova_feedback"("status", "severity");

CREATE UNIQUE INDEX "nova_feedback_event_feedbackId_sequence_key" ON "nova_feedback_event"("feedbackId", "sequence");
CREATE INDEX "nova_feedback_event_feedbackId_idx" ON "nova_feedback_event"("feedbackId");
CREATE INDEX "nova_feedback_event_event_idx" ON "nova_feedback_event"("event");

-- AddForeignKey
ALTER TABLE "nova_feedback" ADD CONSTRAINT "nova_feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nova_feedback" ADD CONSTRAINT "nova_feedback_agentSessionId_fkey" FOREIGN KEY ("agentSessionId") REFERENCES "agent_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "nova_feedback" ADD CONSTRAINT "nova_feedback_runId_fkey" FOREIGN KEY ("runId") REFERENCES "agent_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "nova_feedback_event" ADD CONSTRAINT "nova_feedback_event_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "nova_feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
