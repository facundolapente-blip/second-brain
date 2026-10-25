-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "list" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'UYU',
    "category" TEXT,
    "variable" BOOLEAN NOT NULL DEFAULT false,
    "wouldCut" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_externalId_key" ON "BudgetLine"("externalId");

-- CreateIndex
CREATE INDEX "BudgetLine_list_idx" ON "BudgetLine"("list");

