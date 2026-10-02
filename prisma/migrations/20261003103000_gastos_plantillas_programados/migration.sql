-- AlterTable
ALTER TABLE "Account" DROP COLUMN "includeInTotal";

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "scheduleId" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "TxTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "amount" DECIMAL(14,2),
    "accountId" TEXT,
    "categoryId" TEXT,
    "toAccountId" TEXT,
    "toAmount" DECIMAL(14,2),
    "note" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TxTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTransaction" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "toAccountId" TEXT,
    "toAmount" DECIMAL(14,2),
    "note" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "interval" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATE NOT NULL,
    "nextDate" DATE,
    "endDate" DATE,
    "autoConfirm" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledTransaction_nextDate_idx" ON "ScheduledTransaction"("nextDate");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_source_externalId_key" ON "Transaction"("source", "externalId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ScheduledTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TxTemplate" ADD CONSTRAINT "TxTemplate_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TxTemplate" ADD CONSTRAINT "TxTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TxTemplate" ADD CONSTRAINT "TxTemplate_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTransaction" ADD CONSTRAINT "ScheduledTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTransaction" ADD CONSTRAINT "ScheduledTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTransaction" ADD CONSTRAINT "ScheduledTransaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

