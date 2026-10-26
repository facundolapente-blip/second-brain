-- AlterTable
ALTER TABLE "BudgetLine" ADD COLUMN     "freq" TEXT NOT NULL DEFAULT 'month',
ADD COLUMN     "times" INTEGER NOT NULL DEFAULT 1;

