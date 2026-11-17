-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "ladder" JSONB,
ADD COLUMN     "neverTwice" BOOLEAN NOT NULL DEFAULT false;
