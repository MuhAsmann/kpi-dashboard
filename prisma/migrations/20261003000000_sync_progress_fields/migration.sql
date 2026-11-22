-- Track live sync progress (survives page refresh) and enforce a single
-- running sync at a time. Additive, backfills existing rows with 0.
ALTER TABLE "sync_logs" ADD COLUMN IF NOT EXISTS "total_items" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sync_logs" ADD COLUMN IF NOT EXISTS "processed_items" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sync_logs" ADD COLUMN IF NOT EXISTS "current_stage" TEXT;
