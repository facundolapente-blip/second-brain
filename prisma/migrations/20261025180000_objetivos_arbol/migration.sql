-- AlterTable
ALTER TABLE "PlanKeyResult" ADD COLUMN     "parentId" TEXT;

-- CreateTable
CREATE TABLE "PlanStep" (
    "id" TEXT NOT NULL,
    "keyResultId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "blockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanStep_blockId_key" ON "PlanStep"("blockId");

-- CreateIndex
CREATE INDEX "PlanStep_keyResultId_idx" ON "PlanStep"("keyResultId");

-- AddForeignKey
ALTER TABLE "PlanKeyResult" ADD CONSTRAINT "PlanKeyResult_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PlanKeyResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanStep" ADD CONSTRAINT "PlanStep_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "PlanKeyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanStep" ADD CONSTRAINT "PlanStep_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "PlanBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Los bloques que ya estaban atados a una meta pasan a ser sus tareas (agendadas en ese bloque).
INSERT INTO "PlanStep" ("id", "keyResultId", "title", "done", "doneAt", "order", "blockId", "createdAt", "updatedAt")
SELECT 'st' || "id", "keyResultId", "title", "done", CASE WHEN "done" THEN CURRENT_TIMESTAMP ELSE NULL END, 0, "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "PlanBlock" WHERE "keyResultId" IS NOT NULL;
