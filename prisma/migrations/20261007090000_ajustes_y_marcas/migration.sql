-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "isAdjustment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "HabitLog" ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);


-- Las marcas de hoy en adelante se hicieron en la app (la importación de HabitNow
-- fue anterior): quedan protegidas de futuras importaciones.
UPDATE "HabitLog" SET "source" = 'app' WHERE "date" >= DATE '2026-10-06';
