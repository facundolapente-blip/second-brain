-- Plan y Hábitos quedan desenlazados: ningún bloque apunta a un hábito.
UPDATE "PlanBlock" SET "habitId" = NULL WHERE "habitId" IS NOT NULL;
