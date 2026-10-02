import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { addDays, fromDbDate, isISODate, monthBounds, toDbDate, todayISO, TZ } from "./dates";
import { bestStreak, currentStreak, excerpt, wordCount } from "./journal-logic";

export type EntryCardDTO = {
  id: string;
  date: string;
  title: string | null;
  excerpt: string;
  mood: number | null;
  tags: string[];
  /** Palabras de título + texto, para la tarjeta. */
  words: number;
};

export type EntryDTO = {
  id: string;
  date: string;
  title: string | null;
  body: string;
  mood: number | null;
  tags: string[];
  updatedAt: string;
};

/** Las entradas recién creadas y abandonadas sin escribir nada no se listan. */
const NOT_EMPTY: Prisma.JournalEntryWhereInput = {
  OR: [{ title: { not: null } }, { body: { not: "" } }, { mood: { not: null } }, { tags: { isEmpty: false } }],
};

const CARD_SELECT = { id: true, date: true, title: true, body: true, mood: true, tags: true } as const;

type CardRow = { id: string; date: Date; title: string | null; body: string; mood: number | null; tags: string[] };

function toCard(e: CardRow, max = 280): EntryCardDTO {
  return {
    id: e.id,
    date: fromDbDate(e.date),
    title: e.title,
    excerpt: excerpt(e.body, max),
    mood: e.mood,
    tags: e.tags,
    words: wordCount(e.body) + wordCount(e.title ?? ""),
  };
}

const ORDER: Prisma.JournalEntryOrderByWithRelationInput[] = [{ date: "desc" }, { createdAt: "desc" }];

export type EntryFilters = { q?: string; tag?: string; mood?: number; limit?: number };

export async function getEntries({ q, tag, mood, limit = 60 }: EntryFilters) {
  const and: Prisma.JournalEntryWhereInput[] = [NOT_EMPTY];
  if (q) {
    and.push({
      OR: [
        { body: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { tags: { has: q.toLowerCase() } },
      ],
    });
  }
  if (tag) and.push({ tags: { has: tag } });
  if (mood) and.push({ mood });
  const rows = await prisma.journalEntry.findMany({
    where: { AND: and },
    select: CARD_SELECT,
    orderBy: ORDER,
    take: limit + 1,
  });
  return { entries: rows.slice(0, limit).map((r) => toCard(r)), hasMore: rows.length > limit };
}

export async function getEntry(id: string): Promise<EntryDTO | null> {
  const e = await prisma.journalEntry.findUnique({ where: { id } });
  if (!e) return null;
  return {
    id: e.id,
    date: fromDbDate(e.date),
    title: e.title,
    body: e.body,
    mood: e.mood,
    tags: e.tags,
    updatedAt: e.updatedAt.toISOString(),
  };
}

/** Etiquetas usadas, de la más usada a la menos. */
export async function getAllTags(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT t AS tag FROM "JournalEntry", unnest(tags) AS t
    GROUP BY t ORDER BY count(*) DESC, t ASC LIMIT 200`;
  return rows.map((r) => r.tag);
}

async function writtenDays(): Promise<string[]> {
  const rows = await prisma.journalEntry.findMany({
    where: NOT_EMPTY,
    select: { date: true },
    distinct: ["date"],
    orderBy: { date: "asc" },
  });
  return rows.map((r) => fromDbDate(r.date));
}

function hourInMontevideo(): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date()));
}

export type MemoryDTO = {
  /** years: mismo día otros años · months: mismo día otros meses · yesterday: ayer */
  kind: "years" | "months" | "yesterday";
  entries: EntryCardDTO[];
};

/** El mismo día en otros años, si no en otros meses, y si no ayer. */
async function getMemory(today: string): Promise<MemoryDTO | null> {
  const [y, m, d] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const valid = (iso: string) => isISODate(iso) && fromDbDate(toDbDate(iso)) === iso;
  const years: string[] = [];
  for (let i = 1; i <= 30; i++) {
    const iso = `${y - i}-${pad(m)}-${pad(d)}`;
    if (valid(iso)) years.push(iso);
  }
  const months: string[] = [];
  for (let i = 1; i <= 11; i++) {
    const dt = new Date(Date.UTC(y, m - 1 - i, 1));
    const iso = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(d)}`;
    if (valid(iso)) months.push(iso);
  }
  const yesterday = addDays(today, -1);
  const rows = await prisma.journalEntry.findMany({
    where: { AND: [NOT_EMPTY, { date: { in: [...years, ...months, yesterday].map(toDbDate) } }] },
    select: CARD_SELECT,
    orderBy: ORDER,
  });
  const cards = rows.map((r) => toCard(r, 120));
  const pick = (kind: MemoryDTO["kind"], set: string[]) => {
    const entries = cards.filter((c) => set.includes(c.date));
    return entries.length ? { kind, entries } : null;
  };
  return pick("years", years) ?? pick("months", months) ?? pick("yesterday", [yesterday]);
}

export async function getHome() {
  const today = todayISO();
  const [days, memory, todayEntry] = await Promise.all([
    writtenDays(),
    getMemory(today),
    prisma.journalEntry.findFirst({ where: { date: toDbDate(today) }, select: { id: true } }),
  ]);
  return {
    today,
    hour: hourInMontevideo(),
    streak: currentStreak(new Set(days), today),
    wroteToday: days.includes(today) || !!todayEntry,
    memory,
  };
}

/** Entradas de un mes para el calendario. */
export async function getMonthEntries(month: string) {
  const { from, to } = monthBounds(month);
  const rows = await prisma.journalEntry.findMany({
    where: { AND: [NOT_EMPTY, { date: { gte: toDbDate(from), lte: toDbDate(to) } }] },
    select: CARD_SELECT,
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => toCard(r, 160));
}

export async function getStats(month: string) {
  const today = todayISO();
  const { from, to } = monthBounds(month);
  const [days, all] = await Promise.all([
    writtenDays(),
    prisma.journalEntry.findMany({
      where: NOT_EMPTY,
      select: { id: true, date: true, body: true, title: true, mood: true },
    }),
  ]);
  let words = 0;
  const inMonth: { mood: number | null; words: number }[] = [];
  const perMonth = new Map<string, number>();
  const perMonthWords = new Map<string, number>();
  // Entradas por día de la semana, lunes primero.
  const perWeekday = [0, 0, 0, 0, 0, 0, 0];
  let longest: { id: string; date: string; title: string | null; words: number } | null = null;
  for (const e of all) {
    const w = wordCount(e.body) + wordCount(e.title ?? "");
    words += w;
    const iso = fromDbDate(e.date);
    const m = iso.slice(0, 7);
    perMonth.set(m, (perMonth.get(m) ?? 0) + 1);
    perMonthWords.set(m, (perMonthWords.get(m) ?? 0) + w);
    perWeekday[(new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7]++;
    if (!longest || w > longest.words) longest = { id: e.id, date: iso, title: e.title, words: w };
    if (iso >= from && iso <= to) inMonth.push({ mood: e.mood, words: w });
  }
  const perMonthDays = new Map<string, number>();
  for (const d of days) perMonthDays.set(d.slice(0, 7), (perMonthDays.get(d.slice(0, 7)) ?? 0) + 1);
  const moods = inMonth.map((e) => e.mood).filter((m): m is number => m !== null);
  const moodCounts = [1, 2, 3, 4, 5].map((v) => moods.filter((m) => m === v).length);
  return {
    today,
    streak: currentStreak(new Set(days), today),
    best: bestStreak(days),
    firstDate: days[0] ?? null,
    totalEntries: all.length,
    totalDays: days.length,
    totalWords: words,
    monthEntries: inMonth.length,
    monthDays: days.filter((d) => d >= from && d <= to).length,
    monthWords: inMonth.reduce((s, e) => s + e.words, 0),
    monthMood: moods.length ? moods.reduce((s, m) => s + m, 0) / moods.length : null,
    moodCounts,
    perMonth: Object.fromEntries(perMonth),
    perMonthDays: Object.fromEntries(perMonthDays),
    perMonthWords: Object.fromEntries(perMonthWords),
    perWeekday,
    longest,
  };
}
