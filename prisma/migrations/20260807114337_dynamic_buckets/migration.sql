-- Buckets become fully per-project/team-defined instead of a fixed global
-- enum. The only structural rule left is: each project has exactly one
-- bucket flagged is_done = true, which is what "Completed" means for it.
CREATE TABLE "project_buckets" (
    "id" TEXT NOT NULL,
    "project_number" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_buckets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_buckets_project_number_label_key" ON "project_buckets"("project_number", "label");

-- Backfill a ProjectBucket per distinct (project, old fixed-enum bucket)
-- already saved, mapping DONE/TODO/IN_PROGRESS/BLOCKED to sensible labels.
INSERT INTO "project_buckets" ("id", "project_number", "label", "is_done", "sort_order")
SELECT
    substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    project_number,
    CASE bucket
        WHEN 'DONE' THEN 'Done'
        WHEN 'TODO' THEN 'Todo'
        WHEN 'IN_PROGRESS' THEN 'In Progress'
        WHEN 'BLOCKED' THEN 'Blocked'
        ELSE bucket
    END,
    bucket = 'DONE',
    CASE bucket
        WHEN 'TODO' THEN 0
        WHEN 'IN_PROGRESS' THEN 1
        WHEN 'BLOCKED' THEN 2
        WHEN 'DONE' THEN 3
        ELSE 4
    END
FROM (SELECT DISTINCT project_number, bucket FROM "status_mappings") s;

ALTER TABLE "status_mappings" ADD COLUMN "bucket_id" TEXT;

UPDATE "status_mappings" sm
SET "bucket_id" = pb.id
FROM "project_buckets" pb
WHERE pb.project_number = sm.project_number
  AND pb.label = CASE sm.bucket
        WHEN 'DONE' THEN 'Done'
        WHEN 'TODO' THEN 'Todo'
        WHEN 'IN_PROGRESS' THEN 'In Progress'
        WHEN 'BLOCKED' THEN 'Blocked'
        ELSE sm.bucket
    END;

ALTER TABLE "status_mappings" DROP COLUMN "bucket";

ALTER TABLE "status_mappings"
    ADD CONSTRAINT "status_mappings_bucket_id_fkey"
    FOREIGN KEY ("bucket_id") REFERENCES "project_buckets"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
