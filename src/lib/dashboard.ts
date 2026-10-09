import "server-only";
import { prisma } from "./prisma";
import { backupWarning } from "./backup";
import { addDays, diffDays, fromDbDate, monthBounds, shiftMonth, startOfWeek, toDbDate, todayISO, TZ } from "./dates";
import { getHabitsWithLogs } from "./habits";
import { currentStreak as habitStreak, dayState, packAll, showsOn, type DayState } from "./habit-logic";
import { currentStreak as journalStreak, excerpt, wordCount } from "./journal-logic";
import { getAccounts, getCardSummaries, getCategoryBudgets, NOT_ADJUSTMENT, PERSONAL, runSchedules } from "./finance";
import { budgetState, monthShare } from "./budget-logic";
import { getRates, toUyu } from "./fx";
import { toCents, type CurrencyTotals } from "./finance-logic";
import { isFreeBlock, sortBlocks, type BlockDTO } from "./plan-logic";
import { getCheckin, lastWeight } from "./checkin";

/**
 * Resumen de los cuatro módulos para Inicio. Todo se calcula acá (servidor) y
 * viaja como datos planos: los componentes solo dibujan.
 */

/** Estados que cuentan para el cumplimiento de un día: lo que tocaba hacer. */
const COUNTS: DayState[] = ["done", "partial", "failed", "unmarked", "missed", "pending"];

export type DayMix = {
  date: string;
  /** Hábitos hechos / que tocaban ese día (null si no tocaba ninguno). */
  habitsDone: number;
  habitsDue: number;
  wrote: boolean;
  /** Gasto del día en pesos (centavos). */
  spentCents: number;
  blocksDone: number;
  blocksTotal: number;
};

function hourNow(): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date()));
}

export async function getDashboard() {
  const today = todayISO();
  const month = today.slice(0, 7);
  const prevMonth = shiftMonth(month, -1);
  const monday = startOfWeek(today);
  const sunday = addDays(monday, 6);
  // Escritura y hábitos: las últimas 18 semanas (para el mapa de constancia).
  const heatFrom = addDays(monday, -7 * 17);
  const dayOfMonth = Number(today.slice(8, 10));
  const prevSameDay = (() => {
    const { to } = monthBounds(prevMonth);
    const last = Number(to.slice(8, 10));
    return `${prevMonth}-${String(Math.min(dayOfMonth, last)).padStart(2, "0")}`;
  })();

  await runSchedules();
  const rates = await getRates();
  const [checkToday, checkYesterday, weight, { budgets }, backup] = await Promise.all([
    getCheckin(today),
    getCheckin(addDays(today, -1)),
    lastWeight(),
    getCategoryBudgets(today.slice(0, 7)),
    backupWarning(),
  ]);
  const [habitData, journalDays, lastEntry, accounts, flows, categories, blocks, blockLogs, tasks, habitOrderFlag] = await Promise.all([
    getHabitsWithLogs(),
    prisma.journalEntry.findMany({
      where: { OR: [{ title: { not: null } }, { body: { not: "" } }] },
      select: { date: true },
      distinct: ["date"],
      orderBy: { date: "asc" },
    }),
    prisma.journalEntry.findFirst({
      where: { OR: [{ title: { not: null } }, { body: { not: "" } }] },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { id: true, date: true, title: true, body: true, mood: true },
    }),
    getAccounts(),
    prisma.transaction.findMany({
      where: {
        kind: { in: ["expense", "income"] },
        date: { gte: toDbDate(monthBounds(prevMonth).from), lte: toDbDate(monthBounds(month).to) },
        ...NOT_ADJUSTMENT,
        ...PERSONAL,
      },
      select: { date: true, kind: true, amount: true, accountId: true, categoryId: true, category: { select: { kind: true } } },
    }),
    prisma.category.findMany({ select: { id: true, name: true, color: true, icon: true } }),
    prisma.planBlock.findMany({
      where: { date: { gte: toDbDate(monday), lte: toDbDate(sunday) } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    prisma.planBlockLog.findMany({
      where: { date: { gte: toDbDate(monday), lte: toDbDate(sunday) } },
      select: { date: true, title: true, done: true },
    }),
    prisma.planTask.findMany({
      where: { status: { not: "done" } },
      select: { id: true, title: true, deadline: true, priority: true, status: true, progress: true, goal: true },
    }),
    prisma.appSetting.findUnique({ where: { key: "habitos_orden_manual" } }),
  ]);

  // ─── Hábitos ──────────────────────────────────────────────────────────────
  const { habits, logs } = habitData;
  const habitsToday = habits
    .map((h) => ({
      id: h.id,
      name: h.name,
      icon: h.icon,
      color: h.color,
      state: dayState(h, logs[h.id], today, today),
      streak: habitStreak(h, logs[h.id], today),
      weekly: h.frequency === "weekly",
      /** De cantidad: se marca desde el detalle, no con un toque. */
      quantity: h.target > 1 || !!h.unit,
      priority: h.priority,
    }))
    // Los mismos que muestra la lista Hoy (`showsOn`), así las cifras coinciden.
    .filter((h) => showsOn(habits.find((x) => x.id === h.id)!, logs[h.id] ?? {}, today));

  const habitDay = (iso: string) => {
    let done = 0;
    let due = 0;
    for (const h of habits) {
      const s = dayState(h, logs[h.id], iso, today);
      if (!COUNTS.includes(s)) continue;
      due++;
      if (s === "done") done++;
    }
    return { done, due };
  };
  const habitHistory: { date: string; done: number; due: number }[] = [];
  for (let iso = heatFrom; iso <= today; iso = addDays(iso, 1)) habitHistory.push({ date: iso, ...habitDay(iso) });
  const bestHabitStreak = [...habitsToday].sort((a, b) => b.streak - a.streak)[0] ?? null;

  // ─── Journal ──────────────────────────────────────────────────────────────
  const written = journalDays.map((r) => fromDbDate(r.date));
  const writtenSet = new Set(written);
  const monthWritten = written.filter((d) => d.startsWith(month)).length;

  // ─── Gastos ───────────────────────────────────────────────────────────────
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const spentByDay = new Map<string, number>();
  let spentMonth = 0;
  let spentPrevSame = 0;
  let spentPrevTotal = 0;
  let incomeMonth = 0;
  const byCat = new Map<string | null, number>();
  for (const t of flows) {
    // Todo en pesos: los dólares con la cotización del día; un reintegro resta del gasto.
    const iso = fromDbDate(t.date);
    const refund = t.kind === "income" && t.category?.kind === "expense";
    const cents = toUyu(toCents(t.amount), currencyOf.get(t.accountId) ?? "UYU", rates) * (refund ? -1 : 1);
    if (t.kind === "income" && !refund) {
      if (iso.startsWith(month)) incomeMonth += cents;
      continue;
    }
    spentByDay.set(iso, (spentByDay.get(iso) ?? 0) + cents);
    if (iso.startsWith(month)) {
      spentMonth += cents;
      byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + cents);
    } else {
      spentPrevTotal += cents;
      if (iso <= prevSameDay) spentPrevSame += cents;
    }
  }
  // Gasto acumulado día a día: este mes contra el anterior.
  const cumulative = (m: string, upTo: number) => {
    const out: number[] = [];
    let acc = 0;
    for (let d = 1; d <= upTo; d++) {
      acc += spentByDay.get(`${m}-${String(d).padStart(2, "0")}`) ?? 0;
      out.push(acc);
    }
    return out;
  };
  const prevDays = Number(monthBounds(prevMonth).to.slice(8, 10));
  const topCategories = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, cents]) => {
      const c = id ? catById.get(id) : undefined;
      return { id, name: c?.name ?? "Sin clasificar", color: c?.color ?? "stone", icon: c?.icon ?? "Question", cents };
    });
  const balances: CurrencyTotals = {};
  let netWorth = 0;
  for (const a of accounts) {
    // Las cuentas de trabajo no suman a lo personal.
    if (a.archived || a.business) continue;
    balances[a.currency] = (balances[a.currency] ?? 0) + a.balanceCents;
    netWorth += toUyu(a.balanceCents, a.currency, rates);
  }

  // ─── Plan ─────────────────────────────────────────────────────────────────
  const blockDTOs: BlockDTO[] = blocks.map((b) => ({
    id: b.id,
    title: b.title,
    categoryId: b.categoryId,
    date: fromDbDate(b.date),
    startTime: b.startTime,
    endTime: b.endTime,
    sortKey: b.sortKey,
    priority: b.priority,
    done: b.done,
    place: b.place,
    notes: b.notes,
    taskId: b.taskId,
  }));
  const pastLogs = blockLogs.map((l) => ({ date: fromDbDate(l.date), title: l.title, done: l.done }));
  const todayBlocks = sortBlocks(blockDTOs.filter((b) => b.date === today));
  const planCats = new Map(
    (await prisma.planCategory.findMany({ select: { id: true, name: true, color: true } })).map((c) => [c.id, c]),
  );
  const dueTasks = tasks
    .filter((t) => t.deadline)
    .map((t) => ({ ...t, deadline: fromDbDate(t.deadline!), left: diffDays(fromDbDate(t.deadline!), today) }))
    .filter((t) => t.left <= 7)
    .sort((a, b) => a.left - b.left || b.priority - a.priority)
    .slice(0, 5);

  // ─── La semana, los cuatro juntos ─────────────────────────────────────────
  const week: DayMix[] = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDays(monday, i);
    const h = iso <= today ? habitDay(iso) : { done: 0, due: 0 };
    // Más las tarjetas que se pasaron a otra semana desde ese día.
    const dayBlocks = [...blockDTOs, ...pastLogs].filter((b) => b.date === iso && !isFreeBlock(b));
    week.push({
      date: iso,
      habitsDone: h.done,
      habitsDue: h.due,
      wrote: writtenSet.has(iso),
      spentCents: spentByDay.get(iso) ?? 0,
      blocksDone: dayBlocks.filter((b) => b.done).length,
      blocksTotal: dayBlocks.length,
    });
  }

  return {
    today,
    hour: hourNow(),
    backup,
    checkin: { today: checkToday, yesterday: checkYesterday, lastWeightG: weight },
    habits: {
      today: habitsToday,
      doneToday: habitsToday.filter((h) => h.state === "done").length,
      skippedToday: habitsToday.filter((h) => h.state === "skipped").length,
      dueToday: habitsToday.length,
      // Para la tarjeta de Inicio, que es la misma lista que Hoy (filas, orden, marcas).
      list: habits,
      packed: packAll(logs),
      manualOrder: !!habitOrderFlag,
      history: habitHistory,
      best: bestHabitStreak && bestHabitStreak.streak > 0 ? bestHabitStreak : null,
    },
    journal: {
      streak: journalStreak(writtenSet, today),
      wroteToday: writtenSet.has(today),
      monthWritten,
      total: written.length,
      days: written.filter((d) => d >= heatFrom),
      last: lastEntry
        ? {
            id: lastEntry.id,
            date: fromDbDate(lastEntry.date),
            title: lastEntry.title,
            excerpt: excerpt(lastEntry.body, 220),
            words: wordCount(lastEntry.body),
            mood: lastEntry.mood,
          }
        : null,
    },
    gastos: {
      month,
      spentMonth,
      spentPrevSame,
      spentPrevTotal,
      incomeMonth,
      cumThis: cumulative(month, dayOfMonth),
      cumPrev: cumulative(prevMonth, prevDays),
      topCategories,
      balances,
      netWorth,
      /** Hay cuentas de trabajo: el saldo de arriba es solo el personal. */
      hasWork: accounts.some((a) => a.business && !a.archived),
      // Presupuestos que se pasaron, están cerca del tope o van rápido.
      budgetAlerts: budgets
        .map((b) => {
          const c = catById.get(b.categoryId);
          return {
            categoryId: b.categoryId,
            name: c?.name ?? "?",
            color: c?.color ?? "stone",
            icon: c?.icon ?? "Tag",
            spentCents: b.spentCents,
            amountCents: b.amountCents,
            currency: b.currency,
            state: budgetState(b.spentCents, b.amountCents, monthShare(month, today)),
          };
        })
        .filter((b) => b.state !== "ok")
        .sort((a, b) => b.spentCents / b.amountCents - a.spentCents / a.amountCents),
      budgetCount: budgets.length,
      // Tarjetas con el resumen sin pagar que vence en los próximos 5 días (o ya venció).
      cardAlerts: (await getCardSummaries(accounts))
        .filter((c) => c.last && c.last.leftCents > 0 && diffDays(c.last.due, today) <= 5 && diffDays(c.last.due, today) >= -10)
        .map((c) => ({ accountId: c.accountId, name: c.name, currency: c.currency, leftCents: c.last!.leftCents, due: c.last!.due })),
      quickAccounts: accounts.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
      usdRate: rates.toUyu.USD ?? null,
    },
    plan: {
      today: todayBlocks.map((b) => ({ ...b, category: b.categoryId ? (planCats.get(b.categoryId) ?? null) : null })),
      dueTasks,
      // Lo que viene en la semana, para cuando hoy no hay nada.
      upcoming: sortBlocks(blockDTOs.filter((b) => b.date > today && !isFreeBlock(b)))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4),
      weekDone: [...blockDTOs, ...pastLogs].filter((b) => b.done && !isFreeBlock(b)).length,
      weekTotal: [...blockDTOs, ...pastLogs].filter((b) => !isFreeBlock(b)).length,
    },
    week,
    heatFrom,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
