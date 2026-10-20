import { getStats } from "@/lib/journal";
import { formatLong, formatMonth, shiftMonth, todayISO } from "@/lib/dates";
import { MOODS, moodInfo } from "@/lib/journal-logic";
import { tone } from "@/lib/palette";
import { JournalHeader, MoodBadge, Stat } from "../journal-ui";
import { JournalTabs, WriteTodayButton } from "../journal-nav";
import { MonthColumns, MonthHeatmap, WeekdayBars } from "./stats-charts";
import { SlideOnChange } from "@/components/motion-wrap";
import { JournalMonthNav } from "../month-nav";
import { NavDim } from "../../gastos/period-step";
import { JCard, JStat } from "../cards";

export const metadata = { title: "Estadísticas · Journal" };

const nf = new Intl.NumberFormat("es-UY");
const nf1 = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function days(n: number) {
  return n === 1 ? "1 día" : `${nf.format(n)} días`;
}

function daysInMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}


export default async function StatsPage({ searchParams }: PageProps<"/journal/estadisticas">) {
  const sp = await searchParams;
  const today = todayISO();
  const current = today.slice(0, 7);
  const mesRaw = typeof sp.mes === "string" ? sp.mes : "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(mesRaw) && mesRaw <= current ? mesRaw : current;
  const s = await getStats(month);
  const avg = s.monthMood !== null ? Math.round(s.monthMood) : null;
  const moodTotal = s.moodCounts.reduce((a, b) => a + b, 0);
  const last12 = Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11));
  const monthLen = month === current ? Number(today.slice(8)) : daysInMonth(month);

  if (s.totalEntries === 0) {
    return (
      <>
        <JournalHeader title="Estadísticas" back="/journal" wide tabs={<JournalTabs />} actions={<WriteTodayButton />} />
        <main className="mx-auto max-w-3xl px-4 pt-6 lg:px-10">
          <JCard icon="chart" title="Todavía no hay números" meta="Sin entradas">
            <p className="max-w-[52ch] text-[15px] leading-relaxed text-muted">
              Cuando escribas tus primeras entradas vas a ver acá tu racha, cuánto escribís y en qué meses.
            </p>
          </JCard>
        </main>
      </>
    );
  }

  return (
    <>
      <JournalHeader title="Estadísticas" back="/journal" wide tabs={<JournalTabs />} actions={<WriteTodayButton />} />

      <main className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-3 lg:max-w-6xl lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-8">
        {/* Lo grande: todo lo escrito. Una sola cifra protagonista; al lado, tres cifras en tarjetas. */}
        <section className="grid gap-5 pb-2 lg:col-span-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-10 lg:pb-3">
          <div className="grid gap-1">
            <span className="kicker">Entradas escritas</span>
            <span className="figure pt-2 text-[88px] lg:text-[112px]">{nf.format(s.totalEntries)}</span>
            <span className="max-w-[52ch] pt-2 text-[15px] text-muted">
              En {days(s.totalDays)}
              {s.firstDate && <>, desde {formatMonth(s.firstDate.slice(0, 7))}</>}. {nf.format(s.totalWords)} palabras en total.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 lg:self-end lg:gap-3">
            <JStat icon="fire" label="Racha" figure={s.streak} sub={s.streak === 1 ? "día seguido" : "días seguidos"} />
            <JStat icon="trophy" label="Récord" figure={s.best} sub="días" />
            <JStat
              icon="pen"
              label="Por entrada"
              figure={nf.format(Math.round(s.totalWords / s.totalEntries))}
              sub="palabras"
            />
            {s.longest && (
              <JStat
                icon="text"
                label="La más larga"
                href={`/journal/${s.longest.id}`}
                figure={nf.format(s.longest.words)}
                sub={`palabras, ${s.longest.title || formatLong(s.longest.date)}`}
              />
            )}
          </div>
          {s.streak === 0 && (
            <p className="-mt-2 text-[13px] text-muted lg:col-start-2 lg:mt-0">Escribí hoy para arrancar una racha nueva.</p>
          )}
        </section>

        {s.firstDate && (
          <JCard icon="calendar-check" title="Constancia" meta="Días escritos por mes" className="lg:col-span-7">
            <MonthHeatmap
              firstMonth={s.firstDate.slice(0, 7)}
              currentMonth={current}
              perMonthDays={s.perMonthDays}
              perMonth={s.perMonth}
              todayDay={Number(today.slice(8))}
            />
          </JCard>
        )}

        <JCard
          icon="chart"
          title="Mes a mes"
          meta="Cifras del mes y entradas de los últimos 12"
          className="lg:col-span-12 lg:row-start-3"
          bodyClassName="grid! gap-5! lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-10! lg:p-7!"
        >
          <div className="grid content-start gap-5">
          {/* El nombre cambia al toque (las flechas quedan quietas: no pierden el foco); las cifras llegan después. */}
          <JournalMonthNav month={month} base="/journal/estadisticas?mes=" max={current} titleClassName="text-[28px]" />

          <NavDim>
          <SlideOnChange k={month} className="grid content-start gap-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 lg:grid-cols-2">
            <Stat label="Entradas" value={<span className="tabular">{s.monthEntries}</span>} />
            <Stat
              label="Días escritos"
              value={<span className="tabular">{s.monthDays}</span>}
              hint={`de ${monthLen}${month === current ? " hasta hoy" : ""}`}
            />
            <Stat label="Palabras" value={<span className="tabular">{nf.format(s.monthWords)}</span>} />
            {s.monthMood !== null ? (
              <Stat
                label="Ánimo promedio"
                value={
                  <span className="flex items-center gap-2">
                    <MoodBadge mood={avg} size={28} />
                    <span className="tabular">{nf1.format(s.monthMood)}</span>
                  </span>
                }
                hint={avg ? moodInfo(avg)!.label : undefined}
              />
            ) : (
              <Stat
                label="Por entrada"
                value={<span className="tabular">{s.monthEntries ? nf.format(Math.round(s.monthWords / s.monthEntries)) : 0}</span>}
                hint="palabras"
              />
            )}
          </div>

          {moodTotal > 0 && (
            <div className="grid gap-3">
              <span className="kicker">Cómo estuviste</span>
              <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-[2px]">
                {MOODS.map((m, i) =>
                  s.moodCounts[i] ? (
                    <span
                      key={m.value}
                      style={{ ...tone(m.color), flexGrow: s.moodCounts[i] }}
                      className="bg-tone-solid"
                      title={`${m.label}: ${days(s.moodCounts[i])}`}
                    />
                  ) : null,
                )}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
                {MOODS.map((m, i) => (
                  <li key={m.value} className="inline-flex items-center gap-1.5">
                    <span style={tone(m.color)} className="size-2.5 rounded-[3px] bg-tone-solid" />
                    <span className="text-muted">{m.label}</span>
                    <span className="tabular font-medium">{s.moodCounts[i]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          </SlideOnChange>
          </NavDim>

          </div>

          <div className="grid content-start gap-1 lg:border-l lg:border-line lg:pl-10">
            <h3 className="kicker">Entradas por mes</h3>
            <MonthColumns
              months={last12}
              values={last12.map((m) => s.perMonth[m] ?? 0)}
              selected={month}
              basePath="/journal/estadisticas"
              height={170}
            />
          </div>
        </JCard>

        <JCard
          icon="calendar"
          title="Qué días escribís"
          meta="Entradas por día de la semana"
          className="lg:col-span-5 lg:col-start-8 lg:row-start-2"
        >
          <WeekdayBars values={s.perWeekday} />
        </JCard>
      </main>
    </>
  );
}
