import Link from "next/link";
import { ArrowRight, Fire, Trophy } from "@phosphor-icons/react/dist/ssr";
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


/** En la computadora cada bloque es una tarjeta con el aro y la sombra del tema. */
const CARD =
  "lg:rounded-2xl lg:border lg:border-[var(--card-ring)] lg:bg-surface lg:p-7 lg:shadow-[var(--card-shadow)]";

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
          <div className="grid justify-items-start gap-2 border-y border-line py-10">
            <h2 className="display text-[30px]">Todavía no hay números</h2>
            <p className="max-w-[52ch] text-[15px] leading-relaxed text-muted">
              Cuando escribas tus primeras entradas vas a ver acá tu racha, cuánto escribís y en qué meses.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <JournalHeader title="Estadísticas" back="/journal" wide tabs={<JournalTabs />} actions={<WriteTodayButton />} />

      <main className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-12 px-4 pt-3 lg:max-w-6xl lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-8">
        {/* Lo grande: todo lo escrito. Una sola cifra protagonista. */}
        <section className="rise grid gap-6 lg:col-span-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-10 lg:pb-4">
          <div className="grid gap-1">
            <span className="kicker">Entradas escritas</span>
            <span className="figure pt-2 text-[88px] lg:text-[112px]">{nf.format(s.totalEntries)}</span>
            <span className="max-w-[52ch] pt-2 text-[15px] text-muted">
              En {days(s.totalDays)}
              {s.firstDate && <>, desde {formatMonth(s.firstDate.slice(0, 7))}</>}. {nf.format(s.totalWords)} palabras en total.
            </span>
          </div>

          <div className="grid grid-cols-3 divide-x divide-line border-y border-line lg:self-end">
            <div className="grid content-start gap-1 py-4 pr-3 sm:py-5">
              <span className="kicker flex items-center gap-1">
                <Fire size={13} weight="fill" className="text-[var(--p-orange-solid)]" aria-hidden /> Racha
              </span>
              <span className="figure pt-1 text-[36px]">{s.streak}</span>
              <span className="text-[13px] text-muted">{s.streak === 1 ? "día seguido" : "días seguidos"}</span>
            </div>
            <div className="grid content-start gap-1 px-3 py-4 sm:px-5 sm:py-5">
              <span className="kicker flex items-center gap-1">
                <Trophy size={13} weight="fill" className="text-[var(--p-yellow-solid)]" aria-hidden /> Récord
              </span>
              <span className="figure pt-1 text-[36px]">{s.best}</span>
              <span className="text-[13px] text-muted">días</span>
            </div>
            <div className="grid content-start gap-1 py-4 pl-3 sm:py-5 sm:pl-5">
              <span className="kicker">Por entrada</span>
              <span className="figure pt-1 text-[36px]">
                {nf.format(Math.round(s.totalWords / s.totalEntries))}
              </span>
              <span className="text-[13px] text-muted">palabras</span>
            </div>
          </div>
          {s.streak === 0 && (
            <p className="-mt-3 text-[13px] text-muted lg:col-start-2 lg:mt-0">Escribí hoy para arrancar una racha nueva.</p>
          )}
        </section>

        {s.firstDate && (
          <section className={`grid content-start gap-3 lg:col-span-7 ${CARD}`}>
            <h2 className="display text-[28px]">Constancia</h2>
            <MonthHeatmap
              firstMonth={s.firstDate.slice(0, 7)}
              currentMonth={current}
              perMonthDays={s.perMonthDays}
              perMonth={s.perMonth}
              todayDay={Number(today.slice(8))}
            />
          </section>
        )}

        <section className={`grid gap-5 border-t border-line pt-8 lg:col-span-12 lg:row-start-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-10 ${CARD}`}>
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
        </section>

        <section
          className={`grid gap-8 border-t border-line pt-8 sm:grid-cols-2 lg:col-span-5 lg:col-start-8 lg:row-start-2 lg:grid-cols-1 lg:content-start lg:gap-7 ${CARD}`}
        >
          <div className="grid content-start gap-3">
            <h2 className="display text-[24px]">Qué días escribís</h2>
            <WeekdayBars values={s.perWeekday} />
          </div>
          {s.longest && (
            <div className="grid content-start gap-3">
              <h2 className="display text-[24px]">La entrada más larga</h2>
              <Link
                href={`/journal/${s.longest.id}`}
                className="group grid gap-1 border-y border-line py-4 transition-colors hover:border-fg/50"
              >
                <span className="figure text-[52px]">{nf.format(s.longest.words)}</span>
                <span className="kicker">palabras</span>
                <span className="mt-3 flex items-center gap-2 font-serif text-[18px]">
                  <span className="min-w-0 flex-1 truncate first-letter:uppercase">
                    {/* formatLong ya trae el año cuando no es el actual. */}
                    {s.longest.title || formatLong(s.longest.date)}
                  </span>
                  <ArrowRight size={16} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
