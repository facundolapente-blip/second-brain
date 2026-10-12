-- Presupuesto mensual con arrastre: lo que sobra pasa al mes siguiente.
-- (La moneda de los presupuestos puntuales ya existía: "BudgetProject"."currency".)
ALTER TABLE "CategoryBudget" ADD COLUMN "rollover" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CategoryBudget" ADD COLUMN "rolloverSince" DATE;
