-- AlterTable
ALTER TABLE "PlanTask" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;


-- Arranca con el orden de "Para hacer" (en curso primero, después prioridad y deadline),
-- así al empezar a arrastrar nada cambia de lugar.
UPDATE "PlanTask" t SET "order" = s.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (
    ORDER BY CASE "status" WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'backlog' THEN 2 ELSE 3 END,
             "priority" DESC, "deadline" ASC NULLS LAST, "createdAt" ASC
  ) AS rn
  FROM "PlanTask"
) s
WHERE t."id" = s."id";
