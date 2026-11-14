-- CreateTable
CREATE TABLE "LifeWheel" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "scores" JSONB NOT NULL,
    "note" TEXT,
    "source" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifeWheel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FocusSession" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "taskId" TEXT,
    "blockId" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FocusSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LifeWheel_externalId_key" ON "LifeWheel"("externalId");

-- CreateIndex
CREATE INDEX "LifeWheel_date_idx" ON "LifeWheel"("date");

-- CreateIndex
CREATE INDEX "FocusSession_day_idx" ON "FocusSession"("day");

