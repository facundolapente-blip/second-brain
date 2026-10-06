/**
 * Proyección de gastos (puro, servidor y cliente). Solo pesos uruguayos.
 *
 * Cierre del mes: lo gastado + un ritmo diario para lo que falta. El ritmo
 * mezcla el de este mes con el promedio de los 3 meses anteriores, pesando
 * más el de este mes a medida que avanza (al principio del mes un solo gasto
 * grande no debería disparar la proyección).
 * Próximos meses: promedio de los 3 últimos meses cerrados corregido por la
 * tendencia (recta de mínimos cuadrados de los últimos 6).
 */
import { monthBounds, shiftMonth } from "./dates";

export type FlowDay = { date: string; kind: "income" | "expense"; categoryId: string | null; cents: number };

/** A pesos enteros (los centavos de una estimación son ruido). */
const r100 = (cents: number) => Math.round(cents / 100) * 100;

function daysIn(month: string) {
  return Number(monthBounds(month).to.slice(8, 10));
}

function slope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  return den ? num / den : 0;
}

export function buildProjection(rows: FlowDay[], month: string, today: string, upcoming: { expense: number; income: number }) {
  const days = daysIn(month);
  const elapsed = Math.max(1, Number(today.slice(8, 10)));
  const left = days - elapsed;
  const past = [1, 2, 3, 4, 5, 6].map((i) => shiftMonth(month, -i)); // del más nuevo al más viejo

  const sum = (m: string, kind: "income" | "expense", cat?: string | null) =>
    rows
      .filter((r) => r.kind === kind && r.date.startsWith(m) && (cat === undefined || r.categoryId === cat))
      .reduce((n, r) => n + r.cents, 0);

  const spent = sum(month, "expense");
  const income = sum(month, "income");
  const last3 = past.slice(0, 3);
  const avgMonth = last3.reduce((n, m) => n + sum(m, "expense"), 0) / 3;
  const avgDaily = last3.reduce((n, m) => n + sum(m, "expense") / daysIn(m), 0) / 3;
  const w = elapsed / days;
  const rate = w * (spent / elapsed) + (1 - w) * avgDaily;
  const projected = r100(spent + rate * left);
  // Ingresos: igual que el gasto (lo que suele entrar en lo que queda del mes).
  const avgIncDaily = last3.reduce((n, m) => n + sum(m, "income") / daysIn(m), 0) / 3;
  const incomeLeft = r100((w * (income / elapsed) + (1 - w) * avgIncDaily) * left);
  const lastMonth = sum(past[0], "expense");

  // Acumulado día a día: real, proyectado y el promedio de los 3 meses.
  const daily = (m: string) => {
    const out = Array<number>(daysIn(m)).fill(0);
    for (const r of rows) if (r.kind === "expense" && r.date.startsWith(m)) out[Number(r.date.slice(8, 10)) - 1] += r.cents;
    return out;
  };
  const cur = daily(month);
  const actual: number[] = [];
  let acc = 0;
  for (let d = 0; d < elapsed; d++) {
    acc += cur[d];
    actual.push(acc);
  }
  const projectedLine: (number | null)[] = Array(days).fill(null);
  for (let d = elapsed - 1; d < days; d++) projectedLine[d] = r100(spent + rate * (d - elapsed + 1));
  const cums = last3.map((m) => {
    let a = 0;
    return daily(m).map((v) => (a += v));
  });
  const avgLine = Array.from({ length: days }, (_, d) =>
    r100(cums.reduce((n, c) => n + (c[Math.min(d, c.length - 1)] ?? 0), 0) / 3),
  );

  // Por categoría: proyección al cierre contra el promedio de 3 meses.
  const catIds = [...new Set(rows.filter((r) => r.kind === "expense").map((r) => r.categoryId))];
  const categories = catIds
    .map((id) => {
      const s = sum(month, "expense", id);
      const avg = last3.reduce((n, m) => n + sum(m, "expense", id), 0) / 3;
      const proj = r100(s + (w * (s / elapsed) + (1 - w) * (avg / days)) * left);
      return { categoryId: id, spent: s, projected: Math.max(s, proj), avg: r100(avg) };
    })
    .filter((c) => c.spent > 0 || c.avg > 0)
    .sort((a, b) => b.projected - a.projected);

  // Próximos 3 meses.
  const hist = [...past].reverse().map((m) => ({ month: m, expense: sum(m, "expense"), income: sum(m, "income") }));
  const trendExp = slope(hist.map((h) => h.expense));
  const avgInc = last3.reduce((n, m) => n + sum(m, "income"), 0) / 3;
  // La tendencia corrige el promedio, pero como mucho un 25% para no dispararse.
  const capped = (base: number, delta: number) => base + Math.max(-0.25 * base, Math.min(0.25 * base, delta));
  const next = [1, 2, 3].map((i) => {
    const expense = Math.max(0, r100(capped(avgMonth, trendExp * (i + 1))));
    // Los ingresos llegan a saltos: promedio sin tendencia.
    const inc = r100(avgInc);
    return { month: shiftMonth(month, i), expense, income: inc, saving: inc - expense };
  });

  return {
    month,
    days,
    elapsed,
    spent,
    income,
    projected,
    incomeLeft,
    avgMonth: r100(avgMonth),
    lastMonth,
    /** Lo que falta de recurrentes este mes (ya conocido). */
    upcoming,
    actual,
    projectedLine,
    avgLine,
    categories,
    hist,
    next,
    trendPct: avgMonth ? (trendExp * 3) / avgMonth : 0,
  };
}

export type Projection = ReturnType<typeof buildProjection>;
