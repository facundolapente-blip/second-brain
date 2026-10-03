import Link from "next/link";
import { ArrowRight, CaretLeft, CaretRight, Fire, Trophy } from "@phosphor-icons/react/dist/ssr";
import { getStats } from "@/lib/journal";
import { formatLong, formatMonth, shiftMonth, todayISO } from "@/lib/dates";
import { MOODS, moodInfo } from "@/lib/journal-logic";
import { tone } from "@/lib/palette";
import { JournalHeader, MoodBadge, Stat } from "../journal-ui";
import { JournalTabs, WriteTodayButton } from "../journal-nav";
import { MonthColumns, MonthHeatmap, WeekdayBars } from "./stats-charts";

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

const monthLink = (m: string) => `/journal/estadisticas?mes=${m}`;

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
        <JournalHeader title="Estadísticas" back="/journal" tabs={<JournalTabs />} actions={<WriteTodayButton />} />
        <main className="mx-auto max-w-3xl px-4 pt-6 lg:px-8">
          <div className="grid justify-items-start gap-2 border border-dashed border-line-strong p-8">
            <h2 className="font-serif text-[22px] font-semibold tracking-tight">Todavía no hay números</h2>
            <p className="max-w-[44ch] text-sm leading-relaxed text-muted">
              Cuando escribas tus primeras entradas vas a ver acá tu racha, cuánto escribís y en qué meses.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <JournalHeader title="Estadísticas" back="/journal" tabs={<JournalTabs />} actions={<WriteTodayButton />} />

      <main className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-10 px-4 pt-3 lg:px-8 lg:pt-8">
        {/* Lo grande: todo lo escrito. Una sola cifra protagonista. */}
        <section className="rise grid gap-6">
          <div className="grid gap-1">
            <span className="label-mono text-muted">Entradas escritas</span>
            <span className="tabular text-[64px] leading-none font-semibold tracking-[-0.04em]">{nf.format(s.totalEntries)}</span>
            <span className="text-sm text-muted">
              En {days(s.totalDays)}
              {s.firstDate && <>, desde {formatMonth(s.firstDate.slice(0, 7))}</>}. {nf.format(s.totalWords)} palabras en total.
            </span>
          </div>

          <div className="grid grid-cols-3 divide-x divide-line border border-line-strong bg-surface">
            <div className="grid content-start gap-1 p-3.5 sm:p-4">
              <span className="label-mono flex items-center gap-1 text-[10px] text-muted">
                <Fire size={13} weight="fill" className="text-accent" aria-hidden /> Racha
              </span>
              <span className="tabular text-[28px] leading-tight font-semibold tracking-tight">{s.streak}</span>
              <span className="text-[12px] text-muted">{s.streak === 1 ? "día seguido" : "días seguidos"}</span>
            </div>
            <div className="grid content-start gap-1 p-3.5 sm:p-4">
              <span className="label-mono flex items-center gap-1 text-[10px] text-muted">
                <Trophy size={13} weight="fill" className="text-muted" aria-hidden /> Récord
              </span>
              <span className="tabular text-[28px] leading-tight font-semibold tracking-tight">{s.best}</span>
              <span className="text-[12px] text-muted">días</span>
            </div>
            <div className="grid content-start gap-1 p-3.5 sm:p-4">
              <span className="label-mono text-[10px] text-muted">Por entrada</span>
              <span className="tabular text-[28px] leading-tight font-semibold tracking-tight">
                {nf.format(Math.round(s.totalWords / s.totalEntries))}
              </span>
              <span className="text-[12px] text-muted">palabras</span>
            </div>
          </div>
          {s.streak === 0 && <p className="-mt-3 text-[13px] text-muted">Escribí hoy para arrancar una racha nueva.</p>}
        </section>

        {s.firstDate && (
          <section className="grid gap-3">
            <h2 className="label-mono flex items-center gap-2 text-fg after:h-px after:flex-1 after:bg-line-strong">Constancia</h2>
            <MonthHeatmap
              firstMonth={s.firstDate.slice(0, 7)}
              currentMonth={current}
              perMonthDays={s.perMonthDays}
              perMonth={s.perMonth}
              todayDay={Number(today.slice(8))}
            />
          </section>
        )}

        <section className="grid gap-5 border-t border-line pt-8">
          <div className="flex items-center justify-between">
            <Link
              href={monthLink(shiftMonth(month, -1))}
              scroll={false}
              aria-label="Mes anterior"
              className="inline-flex size-11 items-center justify-center rounded-md border border-line-strong text-fg transition-colors hover:border-rule hover:bg-surface-2"
            >
              <CaretLeft size={18} weight="bold" />
            </Link>
            <h2 className="text-[19px] font-bold tracking-tight first-letter:uppercase">{formatMonth(month)}</h2>
            {month < current ? (
              <Link
                href={monthLink(shiftMonth(month, 1))}
                scroll={false}
                aria-label="Mes siguiente"
                className="inline-flex size-11 items-center justify-center rounded-md border border-line-strong text-fg transition-colors hover:border-rule hover:bg-surface-2"
              >
                <CaretRight size={18} weight="bold" />
              </Link>
            ) : (
              <span className="size-11" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
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
              <span className="label-mono text-muted">Cómo estuviste</span>
              <div className="flex h-4 gap-[2px] overflow-hidden">
                {MOODS.map((m, i) =>
                  s.moodCounts[i] ? (
                    <span
                      key={m.value}
                      style={{ ...tone(m.color), flexGrow: s.moodCounts[i] }}
                      className="bg-tone-solid"
                      title={`${m.label}: ${s.moodCounts[i]}`}
                    />
                  ) : null,
                )}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
                {MOODS.map((m, i) => (
                  <li key={m.value} className="inline-flex items-center gap-1.5">
                    <span style={tone(m.color)} className="size-2.5 rounded-[2px] bg-tone-solid" />
                    <span className="text-muted">{m.label}</span>
                    <span className="tabular font-medium">{s.moodCounts[i]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-1">
            <h3 className="label-mono text-muted">Entradas por mes</h3>
            <MonthColumns
              months={last12}
              values={last12.map((m) => s.perMonth[m] ?? 0)}
              selected={month}
              basePath="/journal/estadisticas"
            />
          </div>
        </section>

        <section className="grid gap-8 border-t border-line pt-8 sm:grid-cols-2">
          <div className="grid content-start gap-3">
            <h2 className="label-mono flex items-center gap-2 text-fg after:h-px after:flex-1 after:bg-line-strong">Qué días escribís</h2>
            <WeekdayBars values={s.perWeekday} />
          </div>
          {s.longest && (
            <div className="grid content-start gap-3">
              <h2 className="label-mono flex items-center gap-2 text-fg after:h-px after:flex-1 after:bg-line-strong">La entrada más larga</h2>
              <Link
                href={`/journal/${s.longest.id}`}
                className="group grid gap-1 border border-line-strong bg-surface p-4 transition-colors hover:border-rule hover:bg-surface-2"
              >
                <span className="tabular text-[40px] leading-none font-semibold tracking-tight">{nf.format(s.longest.words)}</span>
                <span className="label-mono text-muted">palabras</span>
                <span className="mt-2 flex items-center gap-2 font-serif text-[16px]">
                  <span className="min-w-0 flex-1 truncate first-letter:uppercase">
                    {s.longest.title || formatLong(s.longest.date)}
                    {!s.longest.title && ` de ${s.longest.date.slice(0, 4)}`}
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
