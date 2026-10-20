-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "noteId" TEXT;

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "url" TEXT,
    "urlKind" TEXT,
    "thumbnail" TEXT,
    "price" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_section_createdAt_idx" ON "Note"("section", "createdAt");

-- CreateIndex
CREATE INDEX "Note_createdAt_idx" ON "Note"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Note_source_externalId_key" ON "Note"("source", "externalId");

-- CreateIndex
CREATE INDEX "Attachment_noteId_idx" ON "Attachment"("noteId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

