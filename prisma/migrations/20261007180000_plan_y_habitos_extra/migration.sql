-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "isQuit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlanKeyResult" ADD COLUMN     "linkId" TEXT,
ADD COLUMN     "linkType" TEXT;

-- AlterTable
ALTER TABLE "PlanTask" ADD COLUMN     "repeat" TEXT,
ADD COLUMN     "repeatEvery" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "PlanSubtask" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlanSubtask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanSubtask_taskId_idx" ON "PlanSubtask"("taskId");

-- AddForeignKey
ALTER TABLE "PlanSubtask" ADD CONSTRAINT "PlanSubtask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PlanTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Los hábitos de la categoría "Malos hábitos" son de dejar algo.
UPDATE "Habit" SET "isQuit" = true WHERE "categoryId" IN (SELECT "id" FROM "HabitCategory" WHERE "name" = 'Malos hábitos');
