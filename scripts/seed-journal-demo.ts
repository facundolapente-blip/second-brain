/**
 * Carga unas entradas de ejemplo del journal en la base LOCAL para ver la
 * interfaz con datos. Los textos son inventados.
 * Uso: node --env-file=.env scripts/seed-journal-demo.ts
 * Se niega a correr si DATABASE_URL no apunta a localhost.
 */
import { nuevoPrisma } from "../src/lib/prisma-conexion.ts";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("Solo contra la base local (DATABASE_URL en localhost).");

const prisma = nuevoPrisma();
const SOURCE = "demo";

const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Montevideo" });
const today = new Date(`${todayIso}T00:00:00Z`);
const day = (offset: number) => new Date(today.getTime() + offset * 86_400_000);
const yearsAgo = (n: number) => new Date(Date.UTC(today.getUTCFullYear() - n, today.getUTCMonth(), today.getUTCDate()));

const ENTRIES: { date: Date; title?: string; body: string; mood?: number; tags?: string[] }[] = [
  {
    date: day(-1),
    body: "Arranqué el día temprano y salí a caminar por la rambla antes del trabajo. Había viento pero se estaba bien. En la oficina terminé el informe que venía pateando hace dos semanas y me saqué un peso de encima.\n\nA la noche cociné tortilla de papas con Agus y miramos una película. Me acosté sin el celular y dormí bárbaro.",
    mood: 4,
    tags: ["rambla", "trabajo"],
  },
  {
    date: day(-2),
    title: "Charla con mamá",
    body: "Hoy tuve una charla larga con mamá. Me costó decirle algunas cosas pero creo que estuvo bien hacerlo. Quedé cansado, como cuando terminás algo que venías postergando.\n\nMañana quiero ir al gimnasio aunque sea media hora.",
    mood: 3,
    tags: ["familia"],
  },
  {
    date: day(-3),
    body: "Día pesado. Reunión de tres horas que podría haber sido un mail. Me fui con dolor de cabeza y sin ganas de nada. Pedí comida y me quedé tirado en el sillón.",
    mood: 2,
    tags: ["trabajo"],
  },
  {
    date: day(-5),
    body: "Fuimos con los chicos al Cerro a ver el atardecer. Llevamos mate y bizcochos. Hacía tiempo que no me reía tanto. Tengo que acordarme de hacer más seguido estas cosas simples.",
    mood: 5,
    tags: ["amigos", "afuera"],
  },
  {
    date: day(-6),
    body: "Leí casi cien páginas del libro que me prestó Nico. Llovió todo el día así que no salí. Ordené el placard y doné una bolsa de ropa.",
    mood: 4,
    tags: ["lectura"],
  },
  {
    date: day(-9),
    body: "Me desperté con ansiedad sin motivo claro. Escribir esto ya me ayuda un poco. Salí a correr y volví mejor. Ojo con el café de tarde.",
    mood: 2,
    tags: ["ansiedad", "correr"],
  },
  {
    date: day(-12),
    title: "Primer día del curso",
    body: "Empecé el curso de fotografía. Somos ocho y el profe parece buena gente. Aprendí más de exposición en dos horas que en años de sacar fotos con el celular.",
    mood: 4,
    tags: ["fotografía"],
  },
  {
    date: day(-31),
    body: "Fin de mes. Repaso: dormí mejor, fui al gimnasio dos veces por semana, leí dos libros. Lo que no salió: cocinar más en casa. Para el mes que viene, planificar las compras el domingo.",
    mood: 3,
    tags: ["repaso"],
  },
  {
    date: day(-45),
    body: "Cumpleaños de la abuela. Comimos asado en lo de mi tío y la abuela contó historias de cuando vino de España. Grabé un audio para no olvidarlas.",
    mood: 5,
    tags: ["familia"],
  },
  {
    date: yearsAgo(1),
    body: "Hace calor por primera vez en el año. Me mudé hace un mes y todavía hay cajas por todos lados, pero el apartamento ya se siente mío. Compré plantas para el balcón.",
    mood: 4,
    tags: ["casa"],
  },
  {
    date: new Date(Date.UTC(today.getUTCFullYear() - 1, 2, 14)),
    body: "Semana complicada en el trabajo, mucha presión con la entrega. Al menos los viernes de fútbol siguen firmes.",
    mood: 3,
    tags: ["trabajo", "fútbol"],
  },
];

let n = 0;
for (const [i, e] of ENTRIES.entries()) {
  const externalId = `demo-${i}`;
  await prisma.journalEntry.upsert({
    where: { source_externalId: { source: SOURCE, externalId } },
    create: { ...e, title: e.title ?? null, mood: e.mood ?? null, tags: e.tags ?? [], source: SOURCE, externalId },
    update: {},
  });
  n++;
}
console.log(`Listo: ${n} entradas de ejemplo (${await prisma.journalEntry.count()} en total).`);
await prisma.$disconnect();
