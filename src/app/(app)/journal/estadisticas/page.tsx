import Link from "next/link";
import { CaretLeft, CaretRight, Fire } from "@phosphor-icons/react/dist/ssr";
import { getStats } from "@/lib/journal";
import { formatMonth, shiftMonth, todayISO } from "@/lib/dates";
import { MOODS, moodInfo } from "@/lib/journal-logic";
import { tone } from "@/lib/palette";
import { JournalHeader, MoodBadge, Stat } from "../journal-ui";
import { JournalTabs, WriteTodayButton } from "../journal-nav";

export const metadata = { title: "Estadísticas · Journal" };

const nf = new Intl.NumberFormat("es-UY");
const nf1 = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function days(n: number) {
  return n === 1 ? "1 día" : `${nf.format(n)} días`;
}

export default async function StatsPage({ searchParams }: PageProps<"/journal/estadisticas">) {
  const sp = await searchParams;
  const today = todayISO();
  const mesRaw = typeof sp.mes === "string" ? sp.mes : "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(mesRaw) && mesRaw <= today.slice(0, 7) ? mesRaw : today.slice(0, 7);
  const s = await getStats(month);
  const avg = s.monthMood !== null ? Math.round(s.monthMood) : null;
  const moodTotal = s.moodCounts.reduce((a, b) => a + b, 0);

  // Últimos 12 meses terminando en el mes elegido.
  const last12 = Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11));
  const maxPerMonth = Math.max(1, ...last12.map((m) => s.perMonth[m] ?? 0));
  const monthShort = (m: string) =>
    new Intl.DateTimeFormat("es-UY", { month: "narrow", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

  return (
    <>
      <JournalHeader title="Estadísticas" back="/journal" tabs={<JournalTabs />} actions={<WriteTodayButton />} />

      <main className="mx-auto grid max-w-3xl gap-8 px-4 pt-3 lg:px-8 lg:pt-6">
        <section className="rise grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="col-span-2 grid content-start gap-1 rounded-[12px] border border-line bg-surface p-4 sm:col-span-1">
            <span className="flex items-center gap-1.5 text-[13px] text-muted">
              <Fire size={16} weight="fill" className="text-[var(--p-orange-solid)]" /> Racha actual
            </span>
            <span className="tabular text-[40px] leading-none font-semibold tracking-tight">{s.streak}</span>
            <span className="text-sm text-muted">
              {s.streak === 1 ? "día seguido" : "días seguidos"}
              {s.streak === 0 && s.totalEntries > 0 ? ". Escribí hoy para arrancar otra." : ""}
            </span>
            <span className="mt-auto pt-3 text-xs text-muted">Mejor racha: {days(s.best)}</span>
          </div>
          <Stat label="Entradas" value={nf.format(s.totalEntries)} hint={`En ${days(s.totalDays)}`} />
          <Stat label="Palabras" value={nf.format(s.totalWords)} hint={s.totalEntries ? `${nf.format(Math.round(s.totalWords / s.totalEntries))} por entrada` : undefined} />
        </section>

        <section className="grid gap-4">
          <div className="flex items-center justify-between">
            <Link
              href={`/journal/estadisticas?mes=${shiftMonth(month, -1)}`}
              scroll={false}
              aria-label="Mes anterior"
              className="inline-flex size-9 items-center justify-center rounded-md text-accent hover:bg-surface-2"
            >
              <CaretLeft size={18} weight="bold" />
            </Link>
            <h2 className="text-[15px] font-semibold first-letter:uppercase">{formatMonth(month)}</h2>
            {month < today.slice(0, 7) ? (
              <Link
                href={`/journal/estadisticas?mes=${shiftMonth(month, 1)}`}
                scroll={false}
                aria-label="Mes siguiente"
                className="inline-flex size-9 items-center justify-center rounded-md text-accent hover:bg-surface-2"
              >
                <CaretRight size={18} weight="bold" />
              </Link>
            ) : (
              <span className="size-9" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Entradas del mes" value={s.monthEntries} />
            <Stat label="Días escritos" value={s.monthDays} />
            <Stat label="Palabras" value={nf.format(s.monthWords)} />
            <div className="grid content-start gap-1 rounded-[12px] border border-line bg-surface p-4">
              <span className="text-[13px] text-muted">Ánimo promedio</span>
              {s.monthMood !== null ? (
                <span className="flex items-center gap-2">
                  <MoodBadge mood={avg} size={30} />
                  <span className="tabular text-[26px] leading-tight font-semibold tracking-tight">{nf1.format(s.monthMood)}</span>
                </span>
              ) : (
                <span className="text-[26px] leading-tight font-semibold text-faint">Sin datos</span>
              )}
              {avg && <span className="text-xs text-muted">{moodInfo(avg)!.label}</span>}
            </div>
          </div>

          {moodTotal > 0 && (
            <div className="grid gap-3 rounded-[12px] border border-line bg-surface p-4">
              <span className="text-[13px] text-muted">Cómo estuviste</span>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
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
                    <span style={tone(m.color)} className="size-2.5 rounded-full bg-tone-solid" />
                    <span className="text-muted">{m.label}</span>
                    <span className="tabular font-medium">{s.moodCounts[i]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="grid gap-3">
          <h2 className="text-[15px] font-semibold">Entradas por mes</h2>
          <div className="grid grid-cols-12 items-end gap-1.5 rounded-[12px] border border-line bg-surface px-4 pt-5 pb-3">
            {last12.map((m) => {
              const n = s.perMonth[m] ?? 0;
              return (
                <Link
                  key={m}
                  href={`/journal/estadisticas?mes=${m}`}
                  scroll={false}
                  className="group grid justify-items-center gap-1.5"
                  title={`${formatMonth(m)}: ${n}`}
                >
                  <span className="tabular text-[11px] text-muted">{n || ""}</span>
                  <span className="flex h-24 w-full items-end">
                    <span
                      style={{ height: `${Math.max(n ? 6 : 2, (n / maxPerMonth) * 100)}%` }}
                      className={
                        m === month
                          ? "w-full rounded-[4px] bg-accent"
                          : "w-full rounded-[4px] bg-surface-3 transition-colors group-hover:bg-line-strong"
                      }
                    />
                  </span>
                  <span className={m === month ? "text-[11px] font-semibold text-fg uppercase" : "text-[11px] text-muted uppercase"}>
                    {monthShort(m)}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
