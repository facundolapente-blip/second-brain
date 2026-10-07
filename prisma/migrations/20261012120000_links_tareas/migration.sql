-- AlterTable
ALTER TABLE "PlanTask" ADD COLUMN     "links" TEXT[] DEFAULT ARRAY[]::TEXT[];


-- "Agendada" pasa a ser solo la casilla: las tareas que ya tenían bloques quedan tildadas.
UPDATE "PlanTask" SET "scheduled" = true WHERE "id" IN (SELECT "taskId" FROM "PlanBlock" WHERE "taskId" IS NOT NULL);
