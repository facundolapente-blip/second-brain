-- CreateTable
CREATE TABLE "DailyRitual" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "mission" TEXT,
    "frogTaskId" TEXT,
    "frogTitle" TEXT,
    "frogDoneAt" TIMESTAMP(3),
    "missionResult" TEXT,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRitual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyRitual_day_key" ON "DailyRitual"("day");

