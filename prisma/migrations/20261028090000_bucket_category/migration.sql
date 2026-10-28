-- Each bucket says whose clock runs while a task sits in it, so cycle time
-- can count only engineering work (not queue, blocked, or BizDev testing).
ALTER TABLE "project_buckets" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'active';

-- Best-guess backfill from bucket labels; adjust in the Status mapping modal.
UPDATE "project_buckets" SET "category" = 'done' WHERE "is_done";
UPDATE "project_buckets" SET "category" = 'queue'
    WHERE NOT "is_done" AND ("label" ILIKE '%todo%' OR "label" ILIKE '%backlog%');
UPDATE "project_buckets" SET "category" = 'waiting'
    WHERE NOT "is_done" AND ("label" ILIKE '%block%' OR "label" ILIKE '%pause%' OR "label" ILIKE '%wait%' OR "label" ILIKE '%pending%');
UPDATE "project_buckets" SET "category" = 'testing'
    WHERE NOT "is_done" AND ("label" ILIKE '%test%' OR "label" ILIKE '%qa%');
