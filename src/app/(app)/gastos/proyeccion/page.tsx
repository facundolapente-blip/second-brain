import { getAccounts, getCategories, getFlowRows, getSchedules } from "@/lib/finance";
import { monthBounds, shiftMonth, todayISO } from "@/lib/dates";
import { occurrencesBetween } from "@/lib/schedule-logic";
import { buildProjection } from "@/lib/projection";
import { getRates, toUyu } from "@/lib/fx";
import { ProjectionView } from "./projection-view";

export const metadata = { title: "Proyección · Gastos" };

export default async function ProyeccionPage() {
  const today = todayISO();
  const month = today.slice(0, 7);
  const [accounts, categories, rows, schedules] = await Promise.all([
    getAccounts(),
    getCategories(),
    getFlowRows(shiftMonth(month, -6), month),
    getSchedules(),
  ]);
  const rates = await getRates();
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  const flows = rows
    .filter((r) => r.date <= today)
    .map((r) => ({ date: r.date, kind: r.kind, categoryId: r.categoryId, cents: toUyu(r.cents, currencyOf.get(r.accountId) ?? "UYU", rates) }));

  // Recurrentes que faltan este mes (después de hoy), en pesos.
  const end = monthBounds(month).to;
  const upcoming = { expense: 0, income: 0 };
  for (const s of schedules) {
    if (!s.active || !s.nextDate || s.kind === "transfer") continue;
    const n = occurrencesBetween(s, s.nextDate > today ? s.nextDate : today, end).filter((d) => d > today).length;
    upcoming[s.kind] += n * toUyu(s.amountCents, currencyOf.get(s.accountId) ?? "UYU", rates);
  }

  const balance = accounts.filter((a) => !a.archived).reduce((n, a) => n + toUyu(a.balanceCents, a.currency, rates), 0);
  return (
    <ProjectionView
      p={buildProjection(flows, month, today, upcoming)}
      balance={balance}
      usdRate={rates.toUyu.USD ?? null}
      categories={categories}
    />
  );
}
