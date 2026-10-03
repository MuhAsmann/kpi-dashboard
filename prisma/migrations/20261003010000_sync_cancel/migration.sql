-- Cooperative sync cancellation: a flag the running loop polls, plus a
-- terminal CANCELLED status so cancelled runs read as cancelled, not failed.
ALTER TABLE "sync_logs" ADD COLUMN IF NOT EXISTS "cancel_requested" BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE "SyncStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
