-- AlterTable
ALTER TABLE "PlanBlock" ADD COLUMN     "keyResultId" TEXT;

-- AlterTable
ALTER TABLE "PlanBlockLog" ADD COLUMN     "keyResultId" TEXT;

-- AlterTable
ALTER TABLE "PlanObjective" ADD COLUMN     "focus" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AddForeignKey
ALTER TABLE "PlanBlock" ADD CONSTRAINT "PlanBlock_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "PlanKeyResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateIndex
CREATE INDEX "PlanBlock_keyResultId_idx" ON "PlanBlock"("keyResultId");
