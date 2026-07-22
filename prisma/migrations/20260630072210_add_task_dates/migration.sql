-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "end_date" TIMESTAMP(3),
ADD COLUMN     "start_date" TIMESTAMP(3),
ADD COLUMN     "type" TEXT DEFAULT 'Issue';
