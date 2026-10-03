-- CreateTable
CREATE TABLE "PlanCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'stone',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlanCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "categoryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "deadline" DATE,
    "progress" INTEGER,
    "goal" INTEGER,
    "scheduled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "source" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanBlock" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "categoryId" TEXT,
    "date" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "place" TEXT,
    "notes" TEXT,
    "taskId" TEXT,
    "habitId" TEXT,
    "source" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanObjective" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlanObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanKeyResult" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'activity',
    "status" TEXT NOT NULL DEFAULT 'todo',
    "quarters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deadline" DATE,
    "progress" DOUBLE PRECISION,
    "goal" DOUBLE PRECISION,
    "source" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanKeyResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanCategory_name_key" ON "PlanCategory"("name");

-- CreateIndex
CREATE INDEX "PlanTask_status_idx" ON "PlanTask"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PlanTask_source_externalId_key" ON "PlanTask"("source", "externalId");

-- CreateIndex
CREATE INDEX "PlanBlock_date_idx" ON "PlanBlock"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PlanBlock_source_externalId_key" ON "PlanBlock"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanObjective_title_key" ON "PlanObjective"("title");

-- CreateIndex
CREATE UNIQUE INDEX "PlanKeyResult_source_externalId_key" ON "PlanKeyResult"("source", "externalId");

-- AddForeignKey
ALTER TABLE "PlanTask" ADD CONSTRAINT "PlanTask_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PlanCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanBlock" ADD CONSTRAINT "PlanBlock_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PlanCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanBlock" ADD CONSTRAINT "PlanBlock_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PlanTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanBlock" ADD CONSTRAINT "PlanBlock_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanKeyResult" ADD CONSTRAINT "PlanKeyResult_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "PlanObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

