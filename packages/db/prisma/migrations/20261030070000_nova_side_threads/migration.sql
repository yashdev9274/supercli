ALTER TABLE "agent_session" ADD COLUMN "parentSessionId" TEXT;
CREATE INDEX "agent_session_parentSessionId_createdAt_idx" ON "agent_session"("parentSessionId", "createdAt");
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_parentSessionId_fkey" FOREIGN KEY ("parentSessionId") REFERENCES "agent_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
