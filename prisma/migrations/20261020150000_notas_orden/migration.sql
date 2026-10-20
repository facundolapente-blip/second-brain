-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "sortKey" DOUBLE PRECISION NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000);

-- CreateIndex
CREATE INDEX "Note_pinned_sortKey_idx" ON "Note"("pinned", "sortKey");


-- Las notas que ya estaban quedan en el orden de su fecha.
UPDATE "Note" SET "sortKey" = EXTRACT(EPOCH FROM "createdAt") * 1000;
