/**
 * Importa un backup de HabitNow (.hn) a la base.
 *
 *   node --env-file=.env scripts/import-habitnow.ts <archivo.hn> [--replace | --update]
 *   (o desde la app, en Datos, siempre en modo "update")
 *
 * Sin flags se niega a correr si ya hay hábitos cargados. Con --replace
 * BORRA todos los hábitos, marcas y categorías antes de importar.
 * Con --update no borra nada: los hábitos se reconocen por nombre (también los
 * archivados) y de HabitNow se toman las pistas, la frecuencia y las marcas
 * (gana HabitNow en los días que trae). Se conservan el nombre, la categoría,
 * el orden, las notas y los vínculos con el Plan; los hábitos nuevos se crean.
 *
 * Formato del .hn (texto plano, deducido del backup):
 *   {C categorías   id;color;nombre;ícono      (nombre "00cn_xxx" = categoría de fábrica)
 *   {H hábitos      una fila por "pista"; varias pistas del mismo hábito comparten
 *                   |grupo| (campo 1). Campos: id;grupo;;nombre;categoría;0<a|b><prioridad>;
 *                   inicio[fin];descripción;0;<tipo><frecuencia>;veces/semana;unidad;días;meta
 *                   tipo: 0 sí/no, 1 cantidad, 4 checklist. frecuencia: 0 diaria,
 *                   2 X por semana, 8 días fijos flexibles (días con 1 = domingo). a = pista activa.
 *   {S subtareas    hábito;id;texto;...
 *   {X marcas       pista;fecha;estado[;valor;meta]  estado: fd hecho, fc fallado, fa salteado
 *   Fechas: "B" + año-2020 + mes (desde 0) + día, cada uno un dígito en base 36.
 */
import type { PrismaClient } from "@prisma/client";

const b36 = (c: string) => parseInt(c, 36);
function hnDate(code: string): string {
  if (!/^B[0-9a-z]{3}$/.test(code)) throw new Error(`Fecha rara en el backup: ${code}`);
  const y = 2020 + b36(code[1]);
  const m = b36(code[2]) + 1;
  const d = b36(code[3]);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const toDb = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const addDaysIso = (iso: string, n: number) => new Date(toDb(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// Categorías de fábrica de HabitNow → nombre, ícono y color de acá.
const BUILTIN: Record<string, { name: string; icon: string; color: string }> = {
  quit: { name: "Malos hábitos", icon: "Prohibit", color: "red" },
  sports: { name: "Deporte", icon: "PersonSimpleRun", color: "green" },
  nutrition: { name: "Comida", icon: "ForkKnife", color: "orange" },
  health: { name: "Salud", icon: "FirstAid", color: "teal" },
  study: { name: "Estudio", icon: "GraduationCap", color: "blue" },
  work: { name: "Trabajo", icon: "Briefcase", color: "yellow" },
  home: { name: "Hogar", icon: "House", color: "stone" },
  art: { name: "Arte", icon: "PaintBrush", color: "pink" },
  entertainment: { name: "Entretenimiento", icon: "Television", color: "purple" },
  other: { name: "Otros", icon: "Circle", color: "stone" },
  task: { name: "Tareas", icon: "Target", color: "blue" },
  meditation: { name: "Meditación", icon: "Brain", color: "purple" },
  social: { name: "Social", icon: "Users", color: "pink" },
  finance: { name: "Finanzas", icon: "Wallet", color: "green" },
  outdoor: { name: "Aire libre", icon: "Mountains", color: "teal" },
};
// Las que Facu creó a mano.
const CUSTOM: Record<string, { icon: string; color: string }> = {
  Lectura: { icon: "BookOpen", color: "blue" },
  Noche: { icon: "Moon", color: "purple" },
  Movimiento: { icon: "PersonSimpleRun", color: "green" },
};

type Track = {
  id: string;
  group: string;
  name: string;
  category: string;
  active: boolean;
  priority: number;
  start: string;
  end: string | null;
  description: string;
  kind: string;
  freq: string;
  timesPerWeek: number;
  unit: string;
  days: number[];
  target: number;
};


/** "replace" borra todo antes; "update" suma sin borrar; "fresh" exige que no haya hábitos. */
export type HabitNowMode = "replace" | "update" | "fresh";

/** Importa el texto de un backup .hn. Devuelve un resumen para mostrar. */
export async function importHabitNow(prisma: PrismaClient, raw: string, mode: HabitNowMode): Promise<string> {
  const replace = mode === "replace";
  const update = mode === "update";
  if (!raw.includes("{H")) throw new Error("No parece un backup de HabitNow (.hn).");
  const sections: Record<string, string[][]> = {};
  for (const m of raw.matchAll(/\{([A-Z])([^{]*)/g)) {
    sections[m[1]] = m[2]
      .split("|")
      .filter(Boolean)
      .map((r) => r.split(";"));
  }

  const tracks: Track[] = (sections.H ?? []).map((f) => ({
    id: f[0],
    group: String(Math.abs(Number(f[1]))),
    name: f[3].trim(),
    category: f[4],
    active: f[5][1] === "a",
    priority: Math.min(5, Math.max(1, Number(f[5][2]) || 1)),
    start: hnDate(f[6].slice(0, 4)),
    end: f[6].length >= 8 ? hnDate(f[6].slice(4, 8)) : null,
    description: f[7]?.trim() ?? "",
    kind: f[9][0],
    freq: f[9][1],
    timesPerWeek: Math.min(7, Math.max(1, Number(f[10]) || 1)),
    unit: f[11]?.trim() ?? "",
    days: (f[12] ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((d) => (Number(d) + 6) % 7), // 1 = domingo → 0
    target: Math.max(1, Number(f[13]) || 1),
  }));

  const checklist = new Map<string, string[]>();
  for (const f of sections.S ?? []) checklist.set(f[0], [...(checklist.get(f[0]) ?? []), f[2]]);


  const existing = await prisma.habit.count();
  if (existing > 0 && !replace && !update) {
    throw new Error(`Ya hay ${existing} hábitos. Para sumar lo nuevo usá --update; para borrarlos e importar igual, --replace.`);
  }
  if (replace) {
    await prisma.$transaction([
      prisma.habitLog.deleteMany(),
      prisma.habit.deleteMany(),
      prisma.habitCategory.deleteMany(),
    ]);
  }

  // Categorías: solo las que usa algún hábito, en el orden de HabitNow.
  const usedCats = new Set(
    [...groupBy(tracks, (t) => t.group).values()].map((ts) => current(ts).category),
  );
  const catIdMap = new Map<string, string>();
  let order = 0;
  for (const f of sections.C ?? []) {
    const [id, , rawName] = f;
    if (!usedCats.has(id)) continue;
    const builtin = rawName.startsWith("00cn_") ? BUILTIN[rawName.slice(5)] : undefined;
    const data = builtin ?? { name: rawName, ...(CUSTOM[rawName] ?? { icon: "Circle", color: "stone" }) };
    const cat = await prisma.habitCategory.upsert({
      where: { name: data.name },
      create: { ...data, order: order++ },
      update: {},
    });
    catIdMap.set(id, cat.id);
  }

  function groupBy<T>(xs: T[], key: (x: T) => string) {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
    return m;
  }
  /** La pista que manda: la activa, o la última si el hábito quedó archivado. */
  function current(ts: Track[]) {
    return ts.find((t) => t.active) ?? [...ts].sort((a, b) => a.start.localeCompare(b.start)).at(-1)!;
  }

  const trackToHabit = new Map<string, { habitId: string; kind: string; target: number }>();
  const known = new Map(
    (await prisma.habit.findMany({ select: { id: true, name: true, order: true } })).map((h) => [
      h.name.trim().toLowerCase(),
      h,
    ]),
  );
  let habitOrder = Math.max(-1, ...[...known.values()].map((h) => h.order)) + 1;
  let created = 0;
  let updated = 0;
  for (const ts of groupBy(tracks, (t) => t.group).values()) {
    const cur = current(ts);
    const archived = !ts.some((t) => t.active);
    const lastEnd = ts.map((t) => t.end ?? "").sort().at(-1);

    const items = ts.flatMap((t) => checklist.get(t.id) ?? []);
    const description =
      [cur.description, items.length ? `Checklist: ${items.join(", ")}` : ""].filter(Boolean).join("\n") || null;

    // Cada pista se guarda con su configuración: la activa (o la última, si el
    // hábito quedó archivado) es el hábito; las demás, pistas cerradas.
    const config = (t: Track) => {
      // "8" = días fijos flexibles ("Dom (Flexible)"): se cumple cualquier día de
      // esa semana, así que acá es "X veces por semana" (semana de lunes a domingo).
      const flexible = t.freq === "8";
      return {
        frequency: flexible || t.freq === "2" ? "weekly" : "daily",
        weekdays: [] as number[],
        timesPerWeek: flexible ? Math.max(1, t.days.length) : t.timesPerWeek,
        weekStart: 1,
        target: t.kind === "1" ? t.target : 1,
      };
    };
    const sorted = [...ts].sort((a, b) => a.start.localeCompare(b.start));
    const pastTracks = sorted
      .filter((t) => t !== cur)
      .map((t) => {
        // Una pista sin fecha de fin termina el día antes de la siguiente.
        const next = sorted[sorted.indexOf(t) + 1];
        const end = t.end ?? (next ? addDaysIso(next.start, -1) : t.start);
        return { startDate: toDb(t.start), endDate: toDb(end), ...config(t) };
      });
    const fromHabitNow = {
      ...config(cur),
      unit: cur.kind === "1" ? cur.unit || null : null,
      startDate: toDb(cur.start),
      archivedAt: archived ? toDb(lastEnd || cur.start) : null,
    };
    const prev = update ? known.get(cur.name.trim().toLowerCase()) : undefined;
    const habit = prev
      ? await prisma.habit.update({
          where: { id: prev.id },
          data: { ...fromHabitNow, tracks: { deleteMany: {}, create: pastTracks } },
        })
      : await prisma.habit.create({
          data: {
            name: cur.name,
            description,
            categoryId: catIdMap.get(cur.category) ?? null,
            ...fromHabitNow,
            priority: cur.priority,
            order: habitOrder++,
            tracks: { create: pastTracks },
          },
        });
    if (prev) updated++;
    else created++;
    for (const t of ts) trackToHabit.set(t.id, { habitId: habit.id, kind: cur.kind, target: cur.target });
  }

  // Marcas. Si dos pistas marcan el mismo día, gana la última.
  const STATUS: Record<string, string> = { fd: "done", fc: "failed", fa: "skipped" };
  const logs = new Map<string, { habitId: string; date: Date; status: string; value: number }>();
  let skipped = 0;
  for (const f of sections.X ?? []) {
    const h = trackToHabit.get(f[0]);
    const status = STATUS[f[2]];
    if (!h || !status) {
      skipped++;
      continue;
    }
    const date = hnDate(f[1]);
    const value = h.kind === "1" && status === "done" ? Number(f[3]) || h.target : 1;
    logs.set(`${h.habitId}|${date}`, { habitId: h.habitId, date: toDb(date), status, value });
  }
  const rows = [...logs.values()];
  // En --update solo se escribe lo que cambió; la nota del día queda como estaba.
  const have = new Map(
    update
      ? (
          await prisma.habitLog.findMany({
            where: { habitId: { in: [...new Set(rows.map((r) => r.habitId))] } },
            select: { id: true, habitId: true, date: true, status: true, value: true, source: true },
          })
        ).map((l) => [`${l.habitId}|${l.date.toISOString().slice(0, 10)}`, l])
      : [],
  );
  const fresh = rows.filter((r) => !have.has(`${r.habitId}|${r.date.toISOString().slice(0, 10)}`));
  const changed = rows.flatMap((r) => {
    const l = have.get(`${r.habitId}|${r.date.toISOString().slice(0, 10)}`);
    // Lo que se marcó en la app manda: HabitNow no lo pisa.
    return l && l.source !== "app" && (l.status !== r.status || l.value !== r.value)
      ? [{ id: l.id, status: r.status, value: r.value }]
      : [];
  });
  const kept = rows.filter((r) => have.get(`${r.habitId}|${r.date.toISOString().slice(0, 10)}`)?.source === "app").length;
  for (let i = 0; i < fresh.length; i += 1000) {
    await prisma.habitLog.createMany({ data: fresh.slice(i, i + 1000).map((r) => ({ ...r, source: "habitnow" })) });
  }
  for (const c of changed) {
    await prisma.habitLog.update({ where: { id: c.id }, data: { status: c.status, value: c.value } });
  }

  const summary = [
    `Importados: ${await prisma.habit.count()} hábitos (${await prisma.habit.count({ where: { archivedAt: { not: null } } })} archivados),`,
    `${await prisma.habitCategory.count()} categorías, ${rows.length} marcas en el backup.`,
    update ? `Hábitos nuevos: ${created}, actualizados: ${updated}. Marcas nuevas: ${fresh.length}, cambiadas: ${changed.length}${kept ? `, respetadas de la app: ${kept}` : ""}.` : "",
    skipped ? `Ignoradas: ${skipped}.` : "",
  ].filter(Boolean).join(" ");
  return summary;
}
