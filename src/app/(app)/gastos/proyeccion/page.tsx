import { getAccounts, getCategories, getFlowRows, getSchedules } from "@/lib/finance";
import { monthBounds, shiftMonth, todayISO } from "@/lib/dates";
import { occurrencesBetween } from "@/lib/schedule-logic";
import { buildProjection } from "@/lib/projection";
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
  const uyu = new Set(accounts.filter((a) => a.currency === "UYU").map((a) => a.id));
  const flows = rows
    .filter((r) => uyu.has(r.accountId) && r.date <= today)
    .map((r) => ({ date: r.date, kind: r.kind, categoryId: r.categoryId, cents: r.cents }));

  // Recurrentes que faltan este mes (después de hoy), en pesos.
  const end = monthBounds(month).to;
  const upcoming = { expense: 0, income: 0 };
  for (const s of schedules) {
    if (!s.active || !s.nextDate || s.kind === "transfer" || !uyu.has(s.accountId)) continue;
    const n = occurrencesBetween(s, s.nextDate > today ? s.nextDate : today, end).filter((d) => d > today).length;
    upcoming[s.kind] += n * s.amountCents;
  }

  const balance = accounts.filter((a) => !a.archived && a.currency === "UYU").reduce((n, a) => n + a.balanceCents, 0);
  return (
    <ProjectionView
      p={buildProjection(flows, month, today, upcoming)}
      balance={balance}
      categories={categories}
    />
  );
}
