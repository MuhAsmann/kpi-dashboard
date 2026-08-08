-- Convert task status columns from the fixed TaskStatus enum to free text,
-- since a project's GitHub status field values are user-defined per board
-- and can't be safely bucketed into a fixed set of labels.
ALTER TABLE "tasks" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'Todo';

ALTER TABLE "task_histories" ALTER COLUMN "old_status" TYPE TEXT USING "old_status"::TEXT;
ALTER TABLE "task_histories" ALTER COLUMN "new_status" TYPE TEXT USING "new_status"::TEXT;

DROP TYPE "TaskStatus";
