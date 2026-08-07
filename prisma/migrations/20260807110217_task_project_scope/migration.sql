-- Support syncing multiple GitHub Project boards: a task is now unique per
-- (issue, board) instead of per issue alone, since the same issue can be
-- tracked on more than one board.
ALTER TABLE "tasks" ADD COLUMN "project_number" INTEGER;

-- Backfill existing rows: they were all synced from the previously
-- hardcoded single project (GITHUB_PROJECT_NUMBER=9 / "be-alwin").
UPDATE "tasks" SET "project_number" = 9 WHERE "project_number" IS NULL;

DROP INDEX "tasks_github_issue_id_key";
CREATE UNIQUE INDEX "tasks_github_issue_id_project_number_key" ON "tasks"("github_issue_id", "project_number");
