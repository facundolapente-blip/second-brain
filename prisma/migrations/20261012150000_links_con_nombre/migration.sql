-- Los links de las tareas pasan de una lista de textos a [{ url, name }] (el nombre arranca vacío).
ALTER TABLE "PlanTask" ADD COLUMN "links_new" JSONB NOT NULL DEFAULT '[]';
UPDATE "PlanTask" SET "links_new" = COALESCE(
  (SELECT jsonb_agg(jsonb_build_object('url', x, 'name', '')) FROM unnest("links") AS x),
  '[]'::jsonb
);
ALTER TABLE "PlanTask" DROP COLUMN "links";
ALTER TABLE "PlanTask" RENAME COLUMN "links_new" TO "links";
