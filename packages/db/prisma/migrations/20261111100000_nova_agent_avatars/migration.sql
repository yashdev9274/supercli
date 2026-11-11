ALTER TABLE "nova_agent"
  ADD COLUMN "avatarType" TEXT NOT NULL DEFAULT 'clover',
  ADD COLUMN "avatarColor" TEXT NOT NULL DEFAULT '#3b93ed';
