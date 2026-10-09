/**
 * Carga los hábitos de HabitNow (los de las capturas) en la base LOCAL, con
 * historial inventado de las últimas semanas para ver la interfaz con datos.
 * Uso: node --env-file=.env scripts/seed-demo.ts
 * No correr contra producción: el historial es de mentira.
 */
import { nuevoPrisma } from "../src/lib/prisma-conexion.ts";

const prisma = nuevoPrisma();
if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Solo contra la base local.");

const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Montevideo" }) + "T00:00:00Z");
const dayOffset = (n: number) => new Date(today.getTime() + n * 86_400_000);

const CATS = [
  { name: "Malos hábitos", icon: "Prohibit", color: "red" },
  { name: "Mente", icon: "Moon", color: "purple" },
  { name: "Deporte", icon: "PersonSimpleRun", color: "green" },
  { name: "Salud", icon: "FirstAid", color: "teal" },
  { name: "Trabajo", icon: "Briefcase", color: "yellow" },
  { name: "Comida", icon: "ForkKnife", color: "orange" },
];

const HABITS = [
  { name: "No fumar", cat: "Malos hábitos", frequency: "weekly", timesPerWeek: 5, priority: 5, rate: 0.62 },
  { name: "Trabajo", cat: "Trabajo", frequency: "weekly", timesPerWeek: 4, priority: 5, rate: 0.75 },
  { name: "Journaling", cat: "Mente", frequency: "daily", priority: 3, rate: 0.8 },
  { name: "Leer", cat: "Mente", frequency: "weekly", timesPerWeek: 4, priority: 3, rate: 0.85 },
  { name: "Meditar", cat: "Mente", frequency: "daily", priority: 2, rate: 0.6 },
  { name: "8k Pasos", cat: "Deporte", frequency: "weekly", timesPerWeek: 5, rate: 0.9 },
  { name: "Cardio", cat: "Deporte", frequency: "weekly", timesPerWeek: 1, rate: 0.3 },
  { name: "Ducha fría", cat: "Salud", frequency: "weekly", timesPerWeek: 1, rate: 0.3 },
  { name: "Fruta", cat: "Comida", frequency: "weekly", timesPerWeek: 5, target: 1, unit: "Frutas", rate: 0.75 },
  { name: "Gym", cat: "Deporte", frequency: "weekly", timesPerWeek: 3, rate: 0.55 },
  { name: "Planificar semana", cat: "Trabajo", frequency: "weekdays", weekdays: [0], rate: 0.9 },
];

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

for (const [i, c] of CATS.entries()) {
  await prisma.habitCategory.upsert({ where: { name: c.name }, create: { ...c, order: i }, update: {} });
}
const cats = Object.fromEntries((await prisma.habitCategory.findMany()).map((c) => [c.name, c.id]));

for (const [i, h] of HABITS.entries()) {
  if (await prisma.habit.findFirst({ where: { name: h.name } })) continue;
  const habit = await prisma.habit.create({
    data: {
      name: h.name,
      categoryId: cats[h.cat],
      frequency: h.frequency,
      timesPerWeek: h.timesPerWeek ?? 1,
      weekdays: h.weekdays ?? [],
      target: h.target ?? 1,
      unit: h.unit ?? null,
      priority: h.priority ?? 1,
      startDate: dayOffset(-60),
      order: i,
    },
  });
  for (let d = -60; d < 0; d++) {
    const date = dayOffset(d);
    if (h.weekdays && !h.weekdays.includes(date.getUTCDay())) continue;
    const r = rand();
    if (r < h.rate) await prisma.habitLog.create({ data: { habitId: habit.id, date, status: "done", value: 1 } });
    else if (h.frequency !== "weekly" && r < h.rate + 0.1)
      await prisma.habitLog.create({ data: { habitId: habit.id, date, status: "failed", value: 1 } });
  }
}
console.log("Listo:", await prisma.habit.count(), "hábitos,", await prisma.habitLog.count(), "marcas", iso(today));
await prisma.$disconnect();
