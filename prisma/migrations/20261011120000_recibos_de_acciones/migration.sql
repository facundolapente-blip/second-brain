-- CreateTable
CREATE TABLE "ActionReceipt" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionReceipt_createdAt_idx" ON "ActionReceipt"("createdAt");

