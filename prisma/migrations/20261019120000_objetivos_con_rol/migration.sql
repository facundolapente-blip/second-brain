-- AlterTable
ALTER TABLE "PlanObjective" ADD COLUMN     "area" TEXT,
ADD COLUMN     "deadline" DATE,
ADD COLUMN     "goal" DOUBLE PRECISION,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "progress" DOUBLE PRECISION,
ADD COLUMN     "role" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'doing';

