-- CreateTable
CREATE TABLE "PlanMinorGoal" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanMinorGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanMinorGoal_year_idx" ON "PlanMinorGoal"("year");

