import Link from "next/link";
import { SlideOnChange, SwapOnChange } from "@/components/motion-wrap";
import Form from "next/form";
import { CaretDown, CaretLeft, CaretRight, MagnifyingGlass, PenNib, Plus } from "@phosphor-icons/react/dist/ssr";
import { getMonthEntries, getRangeEntries } from "@/lib/journal";
import { addDays, diffDays, formatLong, formatMonth, formatShort, isISODate, monthBounds, shiftMonth, todayISO, weekday } from "@/lib/dates";
import { MOODS, moodInfo } from "@/lib/journal-logic";
import { tone } from "@/lib/palette";
import { EntryCard, JournalHeader, WriteDayButton } from "../journal-ui";
import { JournalTabs, WriteTodayButton } from "../journal-nav";

export const metadata = { title: "Calendario · Journal" };

// cx de components/ui es de cliente: acá va una copia mínima.
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const WEEK_HEAD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const field =
  "h-11 rounded-[10px] border border-line-strong bg-surface px-3 text-[14px] text-fg outline-none focus:border-accent";
const goBtn =
  "inline-flex h-11 items-center rounded-full bg-ink px-4 text-[13.5px] font-medium text-on-ink transition-opacity hover:opacity-85";

export default async function CalendarPage({ searchParams }: PageProps<"/journal/calendario">) {
  const sp = await searchParams;
  const today = todayISO();
  // Período (?desde=&hasta=): lista todo lo escrito entre esas fechas y el calendario va al mes del final.
  let desde = typeof sp.desde === "string" && isISODate(sp.desde) ? sp.desde : null;
  let hasta = typeof sp.hasta === "string" && isISODate(sp.hasta) ? sp.hasta : null;
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  if (desde && hasta && diffDays(hasta, desde) > 366 * 10) desde = addDays(hasta, -366 * 10);
  const range = desde && hasta ? { from: desde, to: hasta } : null;
  const mesRaw = typeof sp.mes === "string" ? sp.mes : "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(mesRaw) ? mesRaw : range ? range.to.slice(0, 7) : today.slice(0, 7);
  const diaRaw = typeof sp.dia === "string" ? sp.dia : "";
  const { from, to } = monthBounds(month);
  const selected = isISODate(diaRaw) && diaRaw >= from && diaRaw <= to ? diaRaw : today >= from && today <= to ? today : null;

  const [entries, rangeEntries] = await Promise.all([getMonthEntries(month), range ? getRangeEntries(range.from, range.to) : null]);
  const byDay = new Map<string, typeof entries>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  const lead = (weekday(from) + 6) % 7; // lunes primero
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = from; d <= to; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedEntries = selected ? (byDay.get(selected) ?? []) : [];
  const monthWords = entries.reduce((n, e) => n + e.words, 0);
  const nf = new Intl.NumberFormat("es-UY");
  // Con un período elegido, moverse por el calendario lo mantiene.
  const keep = range ? `&desde=${range.from}&hasta=${range.to}` : "";
  const href = (m: string, d?: string) => `/journal/calendario?mes=${m}${d ? `&dia=${d}` : ""}${keep}`;
  const rangeLabel = range
    ? range.from === range.to
      ? `${formatShort(range.from)} ${range.from.slice(0, 4)}`
      : `${formatShort(range.from)} ${range.from.slice(0, 4)} – ${formatShort(range.to)} ${range.to.slice(0, 4)}`
    : "";

  return (
    <>
      <JournalHeader title="Calendario" back="/journal" wide tabs={<JournalTabs />} actions={<WriteTodayButton />} />

      <main className="mx-auto grid max-w-3xl gap-8 px-4 pt-3 lg:max-w-6xl lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-10 lg:px-10 lg:pt-8">
        <section className="grid content-start gap-4 lg:rounded-2xl lg:border lg:border-[var(--card-ring)] lg:bg-surface lg:p-7 lg:shadow-[var(--card-shadow)]">
          <div className="flex items-center justify-between">
            <Link
              href={href(shiftMonth(month, -1))}
              scroll={false}
              aria-label="Mes anterior"
              className="inline-flex size-11 items-center justify-center rounded-[4px] text-fg transition-colors hover:bg-surface-2"
            >
              <CaretLeft size={18} />
            </Link>
            <div className="grid justify-items-center gap-0.5 text-center leading-tight">
              <h2 className="display text-[26px] first-letter:uppercase">{formatMonth(month)}</h2>
              <span className="kicker tabular mt-1">
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
              className="inline-flex size-11 items-center justify-center rounded-[4px] text-fg transition-colors hover:bg-surface-2"
            >
              <CaretRight size={18} />
            </Link>
          </div>

          {/* Ir directo a un mes o elegir un período (Form de Next: navega sin recargar la página entera). */}
          <details className="group rounded-xl border border-line px-3 py-2" open={!!range}>
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-[13.5px] font-medium text-muted marker:hidden hover:text-fg">
              <MagnifyingGlass size={15} aria-hidden />
              Buscar un mes o un período
              <CaretDown size={13} aria-hidden className="ml-auto transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-3 pt-2 pb-1">
              <Form action="/journal/calendario" className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-[12.5px] text-muted">
                  Ir a un mes
                  <input type="month" name="mes" defaultValue={month} required className={field} />
                </label>
                <button type="submit" className={goBtn}>
                  Ir
                </button>
              </Form>
              <Form action="/journal/calendario" className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-[12.5px] text-muted">
                  Desde
                  <input type="date" name="desde" defaultValue={range?.from ?? monthBounds(month).from} required className={field} />
                </label>
                <label className="grid gap-1 text-[12.5px] text-muted">
                  Hasta
                  <input type="date" name="hasta" defaultValue={range?.to ?? (today < monthBounds(month).to ? today : monthBounds(month).to)} required className={field} />
                </label>
                <button type="submit" className={goBtn}>
                  Ver período
                </button>
                {range && (
                  <Link href={`/journal/calendario?mes=${month}`} scroll={false} className="inline-flex h-11 items-center px-2 text-[13px] font-medium text-accent-fg hover:underline">
                    Quitar período
                  </Link>
                )}
              </Form>
            </div>
          </details>

          <SlideOnChange k={month}><div className="grid grid-cols-7 justify-items-center gap-y-1 lg:gap-y-2">
            {WEEK_HEAD.map((w) => (
              <span key={w} aria-hidden className="kicker pb-1">
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              if (!d) return <span key={`x${i}`} />;
              const list = byDay.get(d);
              const withMood = list?.findLast((e) => e.mood !== null);
              const info = moodInfo(withMood?.mood);
              const isSel = d === selected;
              const inRange = !!range && d >= range.from && d <= range.to;
              return (
                <Link
                  key={d}
                  href={`/journal/calendario?mes=${month}&dia=${d}`}
                  scroll={false}
                  aria-label={`${formatLong(d)}${list ? `, ${list.length} ${list.length === 1 ? "entrada" : "entradas"}` : ""}`}
                  aria-current={isSel ? "date" : undefined}
                  style={info ? tone(info.color) : undefined}
                  className={cx(
                    "tabular relative inline-flex size-11 items-center justify-center rounded-full text-[15px] transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none lg:size-14 lg:text-[16px]",
                    list
                      ? info
                        ? "bg-tone font-semibold text-tone-fg ring-2 ring-inset ring-[var(--tone-solid)]"
                        : "bg-accent font-semibold text-on-accent"
                      : inRange
                        ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-fg"
                        : d > today
                          ? "text-faint"
                          : "text-fg hover:bg-surface-2",
                    isSel && "ring-[1.5px] ring-fg ring-offset-2 ring-offset-bg lg:ring-offset-surface",
                  )}
                >
                  {Number(d.slice(8))}
                  {d === today && <span aria-hidden className={cx("absolute bottom-1 size-1 rounded-full", list && !info ? "bg-on-accent" : "bg-accent")} />}
                </Link>
              );
            })}
          </div></SlideOnChange>

          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[12.5px] text-muted" aria-label="Referencias de color">
            <li className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-accent" />
              Escrito
            </li>
            {MOODS.map((m) => (
              <li key={m.value} className="inline-flex items-center gap-1.5">
                <span style={tone(m.color)} className="size-3 rounded-full bg-tone ring-[1.5px] ring-inset ring-[var(--tone-solid)]" />
                {m.label}
              </li>
            ))}
          </ul>
        </section>

        <section className="grid content-start gap-3">
          <SwapOnChange k={`${selected}|${range?.from ?? ""}|${range?.to ?? ""}`} className="grid content-start gap-3">
          {rangeEntries && (
            <div className="grid gap-3">
              <div className="grid gap-1 border-b border-fg/80 pb-3">
                <span className="kicker">Período</span>
                <h2 className="display text-[24px]">{rangeLabel}</h2>
                <span className="text-[13.5px] text-muted tabular">
                  {rangeEntries.length === 0
                    ? "No escribiste en esas fechas."
                    : `${rangeEntries.length === 1 ? "1 entrada" : `${rangeEntries.length} entradas`} en ${new Set(rangeEntries.map((e) => e.date)).size} días, ${nf.format(rangeEntries.reduce((n, e) => n + e.words, 0))} palabras`}
                </span>
              </div>
              {[...rangeEntries].reverse().map((e, i) => (
                <EntryCard key={e.id} entry={e} index={i} />
              ))}
            </div>
          )}
          {range ? null : selected ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-fg/80 pb-3">
                <h2 className="display text-[24px] first-letter:uppercase">{formatLong(selected)}</h2>
                {selectedEntries.length > 0 && (
                  <WriteDayButton date={selected} nueva variant="outline">
                    <Plus size={16} weight="bold" /> Otra
                  </WriteDayButton>
                )}
              </div>
              {selectedEntries.length === 0 ? (
                <div className="grid justify-items-start gap-4 py-6">
                  <p className="display text-[20px] text-muted">
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
            <p className="border-t border-line py-6 font-serif text-[20px] text-muted">
              Tocá un día para ver lo que escribiste.
            </p>
          )}

          {/* En la computadora sobra lugar: el resto del mes, renglón por renglón. */}
          {!range && entries.length > 0 && (
            <div className="mt-8 hidden gap-1 lg:grid">
              <h3 className="kicker border-b border-line pb-2">Todo el mes</h3>
              <ul className="grid">
                {entries
                  .filter((e) => e.date !== selected)
                  .reverse()
                  .map((e) => (
                    <li key={e.id}>
                      <Link
                        href={href(month, e.date)}
                        scroll={false}
                        className="-mx-2 grid min-h-11 grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[6px] px-2 py-2 transition-colors hover:bg-surface-2"
                      >
                        <span className="font-mono text-[12px] text-muted tabular">{formatShort(e.date)}</span>
                        <span className="truncate text-[14.5px]">{e.title || e.excerpt || "Sin texto"}</span>
                        <span className="font-mono text-[11px] text-muted tabular">{nf.format(e.words)}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          </SwapOnChange>
        </section>
      </main>
    </>
  );
}
