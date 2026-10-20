-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "category" TEXT;

-- CreateIndex
CREATE INDEX "Note_section_category_idx" ON "Note"("section", "category");

