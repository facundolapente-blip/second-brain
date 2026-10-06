-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "closingDay" INTEGER,
ADD COLUMN     "creditLimit" DECIMAL(14,2),
ADD COLUMN     "dueDay" INTEGER;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "installmentCount" INTEGER,
ADD COLUMN     "installmentGroup" TEXT,
ADD COLUMN     "installmentNo" INTEGER;

-- CreateIndex
CREATE INDEX "Transaction_installmentGroup_idx" ON "Transaction"("installmentGroup");

