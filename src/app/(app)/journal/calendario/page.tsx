import Link from "next/link";
import { CaretLeft, CaretRight, PenNib, Plus } from "@phosphor-icons/react/dist/ssr";
import { getMonthEntries } from "@/lib/journal";
import { addDays, formatLong, formatMonth, isISODate, monthBounds, shiftMonth, todayISO, weekday } from "@/lib/dates";
import { MOODS, moodInfo } from "@/lib/journal-logic";
import { tone } from "@/lib/palette";
import { EntryCard, JournalHeader, WriteDayButton } from "../journal-ui";
import { JournalTabs, WriteTodayButton } from "../journal-nav";

export const metadata = { title: "Calendario · Journal" };

// cx de components/ui es de cliente: acá va una copia mínima.
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const WEEK_HEAD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default async function CalendarPage({ searchParams }: PageProps<"/journal/calendario">) {
  const sp = await searchParams;
  const today = todayISO();
  const mesRaw = typeof sp.mes === "string" ? sp.mes : "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(mesRaw) ? mesRaw : today.slice(0, 7);
  const diaRaw = typeof sp.dia === "string" ? sp.dia : "";
  const { from, to } = monthBounds(month);
  const selected = isISODate(diaRaw) && diaRaw >= from && diaRaw <= to ? diaRaw : today >= from && today <= to ? today : null;

  const entries = await getMonthEntries(month);
  const byDay = new Map<string, typeof entries>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  const lead = (weekday(from) + 6) % 7; // lunes primero
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = from; d <= to; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedEntries = selected ? (byDay.get(selected) ?? []) : [];
  const monthWords = entries.reduce((n, e) => n + e.words, 0);
  const nf = new Intl.NumberFormat("es-UY");
  const href = (m: string, d?: string) => `/journal/calendario?mes=${m}${d ? `&dia=${d}` : ""}`;

  return (
    <>
      <JournalHeader title="Calendario" back="/journal" tabs={<JournalTabs />} actions={<WriteTodayButton />} />

      <main className="mx-auto grid max-w-3xl gap-6 px-4 pt-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10 lg:px-8 lg:pt-6">
        <section className="grid content-start gap-4">
          <div className="flex items-center justify-between">
            <Link
              href={href(shiftMonth(month, -1))}
              scroll={false}
              aria-label="Mes anterior"
              className="inline-flex size-11 items-center justify-center rounded-md text-accent transition-colors hover:bg-surface-2"
            >
              <CaretLeft size={18} weight="bold" />
            </Link>
            <div className="grid justify-items-center gap-0.5 text-center leading-tight">
              <h2 className="text-[17px] font-semibold tracking-tight first-letter:uppercase">{formatMonth(month)}</h2>
              <span className="tabular text-[13px] text-muted">
                {byDay.size === 0
                  ? "Sin entradas"
                  : `${byDay.size === 1 ? "1 día escrito" : `${byDay.size} días escritos`}, ${nf.format(monthWords)} palabras`}
              </span>
              {month !== today.slice(0, 7) && (
                <Link href={href(today.slice(0, 7), today)} scroll={false} className="mt-0.5 text-[13px] font-medium text-accent-fg hover:underline">
                  Volver a hoy
                </Link>
              )}
            </div>
            <Link
              href={href(shiftMonth(month, 1))}
              scroll={false}
              aria-label="Mes siguiente"
              className="inline-flex size-11 items-center justify-center rounded-md text-accent transition-colors hover:bg-surface-2"
            >
              <CaretRight size={18} weight="bold" />
            </Link>
          </div>

          <div className="grid grid-cols-7 justify-items-center gap-y-1">
            {WEEK_HEAD.map((w) => (
              <span key={w} aria-hidden className="pb-1 text-[12px] font-medium text-muted">
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              if (!d) return <span key={`x${i}`} />;
              const list = byDay.get(d);
              const withMood = list?.findLast((e) => e.mood !== null);
              const info = moodInfo(withMood?.mood);
              const isSel = d === selected;
              return (
                <Link
                  key={d}
                  href={href(month, d)}
                  scroll={false}
                  aria-label={`${formatLong(d)}${list ? `, ${list.length} ${list.length === 1 ? "entrada" : "entradas"}` : ""}`}
                  aria-current={isSel ? "date" : undefined}
                  style={info ? tone(info.color) : undefined}
                  className={cx(
                    "tabular relative inline-flex size-11 items-center justify-center rounded-full text-[15px] transition-[background-color,box-shadow] duration-200",
                    list
                      ? info
                        ? "bg-tone font-semibold text-tone-fg"
                        : "bg-accent-soft font-semibold text-accent-fg"
                      : d > today
                        ? "text-faint"
                        : "text-fg hover:bg-surface-2",
                    isSel && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
                  )}
                >
                  {Number(d.slice(8))}
                  {d === today && <span className="absolute bottom-1 h-[3px] w-3.5 rounded-full bg-accent" />}
                </Link>
              );
            })}
          </div>

          <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 pt-1 text-[12px] text-muted" aria-label="Referencias de color">
            <li className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-accent-soft ring-1 ring-accent/30" />
              Escrito
            </li>
            {MOODS.map((m) => (
              <li key={m.value} className="inline-flex items-center gap-1.5">
                <span style={tone(m.color)} className="size-3 rounded-full bg-tone ring-1 ring-[var(--tone-solid)]/40" />
                {m.label}
              </li>
            ))}
          </ul>
        </section>

        <section className="grid content-start gap-3">
          {selected ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[17px] font-semibold tracking-tight first-letter:uppercase">{formatLong(selected)}</h2>
                {selectedEntries.length > 0 && (
                  <WriteDayButton date={selected} nueva variant="outline">
                    <Plus size={16} weight="bold" /> Otra
                  </WriteDayButton>
                )}
              </div>
              {selectedEntries.length === 0 ? (
                <div className="grid justify-items-start gap-3 rounded-[14px] border border-dashed border-line-strong p-6">
                  <p className="font-serif text-[17px] text-muted italic">
                    {selected > today ? "Este día todavía no llegó." : "Este día no escribiste."}
                  </p>
                  {selected <= today && (
                    <WriteDayButton date={selected}>
                      <PenNib size={16} weight="bold" /> Escribir este día
                    </WriteDayButton>
                  )}
                </div>
              ) : (
                selectedEntries.map((e, i) => <EntryCard key={e.id} entry={e} index={i} />)
              )}
            </>
          ) : (
            <p className="rounded-[14px] border border-dashed border-line-strong p-6 font-serif text-[17px] text-muted italic">
              Tocá un día para ver lo que escribiste.
            </p>
          )}
        </section>
      </main>
    </>
  );
}
