-- Ánimo unificado: un solo ánimo por día entre el check-in y el journal.
-- Solo completa lo que falta, nunca pisa un ánimo ya elegido.

-- Entradas del journal sin ánimo toman el del check-in de ese día.
UPDATE "JournalEntry" j
SET "mood" = c."mood"
FROM "DailyCheckin" c
WHERE c."date" = j."date" AND j."mood" IS NULL AND c."mood" IS NOT NULL;

-- Check-ins sin ánimo toman el de la primera entrada del día que tenga.
UPDATE "DailyCheckin" c
SET "mood" = j."mood", "updatedAt" = NOW()
FROM (
  SELECT DISTINCT ON ("date") "date", "mood"
  FROM "JournalEntry"
  WHERE "mood" IS NOT NULL
  ORDER BY "date", "createdAt"
) j
WHERE c."date" = j."date" AND c."mood" IS NULL;

-- Días con ánimo en el journal y sin check-in: se crea el check-in con ese ánimo.
INSERT INTO "DailyCheckin" ("id", "date", "mood", "createdAt", "updatedAt")
SELECT 'animo' || md5(j."date"::text), j."date", j."mood", NOW(), NOW()
FROM (
  SELECT DISTINCT ON ("date") "date", "mood"
  FROM "JournalEntry"
  WHERE "mood" IS NOT NULL
  ORDER BY "date", "createdAt"
) j
WHERE NOT EXISTS (SELECT 1 FROM "DailyCheckin" c WHERE c."date" = j."date");
