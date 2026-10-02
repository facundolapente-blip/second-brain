-- CreateTable
CREATE TABLE "HabitTrack" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "frequency" TEXT NOT NULL,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "timesPerWeek" INTEGER NOT NULL DEFAULT 1,
    "weekStart" INTEGER NOT NULL DEFAULT 1,
    "target" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "HabitTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HabitTrack_habitId_idx" ON "HabitTrack"("habitId");

-- AddForeignKey
ALTER TABLE "HabitTrack" ADD CONSTRAINT "HabitTrack_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

