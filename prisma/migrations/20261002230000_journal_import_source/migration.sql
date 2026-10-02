-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_source_externalId_key" ON "JournalEntry"("source", "externalId");

