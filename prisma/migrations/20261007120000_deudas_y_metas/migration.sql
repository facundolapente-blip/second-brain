-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "person" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UYU',
    "date" DATE NOT NULL,
    "note" TEXT,
    "settledAt" TIMESTAMP(3),
    "settleTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'PiggyBank',
    "color" TEXT NOT NULL DEFAULT 'green',
    "target" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UYU',
    "deadline" DATE,
    "accountId" TEXT,
    "saved" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Debt_settledAt_idx" ON "Debt"("settledAt");

