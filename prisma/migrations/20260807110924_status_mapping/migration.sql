-- User-configured per-project status -> KPI bucket mapping, replacing the
-- session-local "done status" picker with a persistent, per-board setting.
CREATE TABLE "status_mappings" (
    "id" TEXT NOT NULL,
    "project_number" INTEGER NOT NULL,
    "raw_status" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,

    CONSTRAINT "status_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "status_mappings_project_number_raw_status_key" ON "status_mappings"("project_number", "raw_status");
