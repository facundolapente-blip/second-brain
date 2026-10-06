-- DropIndex
DROP INDEX "PlanObjective_title_key";

-- AlterTable
ALTER TABLE "PlanKeyResult" ADD COLUMN     "year" INTEGER NOT NULL DEFAULT 2026;

-- AlterTable
ALTER TABLE "PlanObjective" ADD COLUMN     "year" INTEGER NOT NULL DEFAULT 2026;

-- CreateIndex
CREATE UNIQUE INDEX "PlanObjective_title_year_key" ON "PlanObjective"("title", "year");

