-- CreateTable
CREATE TABLE "PlanBlockLog" (
    "id" TEXT NOT NULL,
    "blockId" TEXT,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "categoryId" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanBlockLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanBlockLog_date_idx" ON "PlanBlockLog"("date");

-- CreateIndex
CREATE INDEX "PlanBlockLog_blockId_idx" ON "PlanBlockLog"("blockId");

