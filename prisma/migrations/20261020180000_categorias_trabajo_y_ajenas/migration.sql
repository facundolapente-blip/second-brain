-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "isBusiness" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPassThrough" BOOLEAN NOT NULL DEFAULT false;
