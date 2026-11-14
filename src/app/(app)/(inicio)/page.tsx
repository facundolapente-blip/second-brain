import { getDashboard } from "@/lib/dashboard";
import { syncGoogleSoon } from "@/lib/gcal";
import { getReserve } from "@/lib/finance";
import { getNotesSummary } from "@/lib/notes";
import { prisma } from "@/lib/prisma";
import { parseValueNotes, VALUES_KEY } from "@/lib/values";
import { MEMENTO_KEY, parseMemento } from "@/lib/memento";
import { wheelDue } from "@/lib/wheels";
import { todayISO } from "@/lib/dates";
import { InicioView } from "./inicio-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Inicio" };

/** Inicio: el día de hoy y la semana con los cuatro módulos juntos. */
export default async function Inicio() {
  // Los eventos de Google Calendar entran a "Plan de hoy" (como mucho cada 5 minutos).
  await syncGoogleSoon();
  const [d, values, reserve, latestNotes, memento, wheel] = await Promise.all([
    getDashboard(),
    prisma.appSetting.findUnique({ where: { key: VALUES_KEY } }),
    getReserve(),
    getNotesSummary(),
    prisma.appSetting.findUnique({ where: { key: MEMENTO_KEY } }),
    wheelDue(todayISO()),
  ]);
  return (
    <div data-module="inicio" className="min-h-dvh">
      <InicioView d={d} notes={parseValueNotes(values?.value)} reserve={{ months: reserve.months, prevMonths: reserve.prevMonths }} latestNotes={latestNotes} memento={parseMemento(memento?.value)} wheelDue={wheel} />
    </div>
  );
}
