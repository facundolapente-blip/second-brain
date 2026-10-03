"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ClockCounterClockwise, FunnelSimple, MagnifyingGlass, PenNib, X } from "@phosphor-icons/react";
import { Button, cx, IconButton, Sheet, type SheetHandle } from "@/components/ui";
import { diffDays, formatLong, formatShort } from "@/lib/dates";
import { MEMORY_COOKIE, MOODS } from "@/lib/journal-logic";
import type { MemoryDTO } from "@/lib/journal";
import { MoodIcon, useWrite } from "./journal-ui";

// ─── Búsqueda y filtros ─────────────────────────────────────────────────────

function useFilterNav() {
  const router = useRouter();
  const params = useSearchParams();
  return (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    next.delete("n");
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `/journal?${qs}` : "/journal", { scroll: false });
  };
}

export function HomeActions({
  q,
  tag,
  mood,
  tags,
}: {
  q: string;
  tag: string;
  mood: number | null;
  tags: string[];
}) {
  const [searching, setSearching] = useState(!!q);
  const [text, setText] = useState(q);
  const nav = useFilterNav();
  const sheet = useRef<SheetHandle>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Si la búsqueda se limpia desde afuera (botón Limpiar), se cierra el campo.
  const [prevQ, setPrevQ] = useState(q);
  if (prevQ !== q) {
    setPrevQ(q);
    if (!q && text.trim()) {
      setText("");
      setSearching(false);
    }
  }

  function onType(v: string) {
    setText(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => nav({ q: v.trim() || null }), 350);
  }

  function closeSearch() {
    clearTimeout(timer.current);
    setSearching(false);
    setText("");
    if (q) nav({ q: null });
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <>
      <IconButton label="Buscar" onClick={() => setSearching(true)}>
        <MagnifyingGlass size={20} />
      </IconButton>
      <IconButton label="Filtrar" onClick={() => sheet.current?.open()} className="relative">
        <FunnelSimple size={20} weight={tag || mood ? "fill" : "regular"} className={cx(!!(tag || mood) && "text-accent")} />
      </IconButton>

      {searching && (
        <div className="absolute inset-x-0 top-[env(safe-area-inset-top)] z-10 bg-bg">
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4 lg:h-16 lg:px-8">
            <MagnifyingGlass size={18} className="shrink-0 text-muted" />
            <input
              autoFocus
              type="search"
              value={text}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && closeSearch()}
              placeholder="Buscar en el journal"
              aria-label="Buscar en el journal"
              enterKeyHint="search"
              className="h-10 min-w-0 flex-1 bg-transparent text-[16px] outline-none! placeholder:text-faint"
            />
            <button type="button" onClick={closeSearch} className="h-9 shrink-0 px-2 text-sm font-semibold text-accent-fg">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <Sheet ref={sheet} title="Filtrar">
        <div className="grid gap-6">
          <section className="grid gap-2.5">
            <h3 className="text-[13px] font-semibold text-muted">Ánimo</h3>
            <div className="grid grid-cols-5 gap-1.5">
              {MOODS.map((m) => {
                const on = mood === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => nav({ animo: on ? null : String(m.value) })}
                    className={cx(
                      "grid justify-items-center gap-1 rounded-md py-2.5 text-[12px] transition-colors",
                      on ? "bg-accent-soft font-semibold text-accent-fg" : "text-muted hover:bg-surface-2",
                    )}
                  >
                    <MoodIcon mood={m.value} size={26} weight={on ? "fill" : "regular"} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </section>
          <section className="grid gap-2.5">
            <h3 className="text-[13px] font-semibold text-muted">Etiqueta</h3>
            {tags.length === 0 ? (
              <p className="text-sm text-muted">Todavía no usaste etiquetas. Se agregan al final de cada entrada.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const on = tag === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => nav({ etiqueta: on ? null : t })}
                      className={cx(
                        "h-8 rounded-full border px-3 text-[13px] transition-colors",
                        on ? "border-accent bg-accent-soft font-semibold text-accent-fg" : "border-line-strong text-fg hover:bg-surface-2",
                      )}
                    >
                      #{t}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
          <div className="flex justify-end gap-2">
            {(tag || mood) && (
              <Button variant="ghost" onClick={() => nav({ etiqueta: null, animo: null })}>
                Quitar filtros
              </Button>
            )}
            <Button onClick={() => sheet.current?.close()}>Listo</Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

// ─── Recuerdo ───────────────────────────────────────────────────────────────

function plural(n: number, one: string, many: string) {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

function memoryText(m: MemoryDTO, today: string): { title: string; line: string } {
  const n = m.entries.length;
  const dayOfMonth = formatLong(today).split(" ").slice(1).join(" "); // "2 de octubre"
  if (m.kind === "years") {
    if (n === 1) {
      const years = Number(today.slice(0, 4)) - Number(m.entries[0].date.slice(0, 4));
      return { title: "En este día", line: `Hace ${plural(years, "año", "años")} escribiste esto.` };
    }
    return { title: "En este día", line: `Tenés ${n} entradas de un ${dayOfMonth} de otros años.` };
  }
  if (m.kind === "months") {
    const d = Number(today.slice(8));
    if (n === 1) {
      const months = Math.round(diffDays(today, m.entries[0].date) / 30.44);
      return { title: "Un día como hoy", line: `Hace ${plural(months, "mes", "meses")} escribiste esto.` };
    }
    return { title: "Un día como hoy", line: `Tenés ${n} entradas de un día ${d} de otros meses.` };
  }
  return { title: "Ayer", line: `Tenés ${plural(n, "entrada", "entradas")} del día anterior.` };
}

function yearsAgo(date: string, today: string) {
  const n = Number(today.slice(0, 4)) - Number(date.slice(0, 4));
  return n === 1 ? "Hace un año" : `Hace ${n} años`;
}

/**
 * Recuerdo: la entrada más cercana se lee como cita (en serif, tres líneas) y
 * las demás quedan como lista corta debajo.
 */
export function MemoryCard({ memory, today }: { memory: MemoryDTO; today: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const { title, line } = memoryText(memory, today);
  const [first, ...rest] = memory.entries;
  const showYear = (d: string) => d.slice(0, 4) !== today.slice(0, 4);

  function dismiss() {
    // Se cierra por hoy; mañana puede aparecer otro recuerdo.
    document.cookie = `${MEMORY_COOKIE}=${today}; path=/journal; max-age=172800; samesite=lax`;
    setHidden(true);
  }

  return (
    <section
      aria-label={title}
      className="rise relative grid grid-cols-[minmax(0,1fr)] gap-3 rounded-card card-2/60 p-4 lg:p-5"
      style={{ "--i": 1 } as React.CSSProperties}
    >
      <div className="flex items-start gap-2.5 pr-10">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-accent-soft text-accent-fg">
          <ClockCounterClockwise size={18} weight="bold" aria-hidden />
        </span>
        <div className="grid min-w-0">
          <h2 className="text-[15px] leading-tight font-semibold">{title}</h2>
          <p className="text-[13px] text-muted">{line}</p>
        </div>
      </div>
      <IconButton label="Cerrar recuerdo por hoy" onClick={dismiss} className="absolute top-3 right-3">
        <X size={16} />
      </IconButton>

      <Link
        href={`/journal/${first.id}`}
        className="group grid gap-1.5 rounded-[12px] border-l-2 border-accent/40 py-1 pr-2 pl-3.5 transition-colors hover:border-accent"
      >
        <span className="text-[12.5px] text-muted">
          {memory.kind === "years" ? `${yearsAgo(first.date, today)}, ` : ""}
          {formatShort(first.date)}
          {showYear(first.date) && ` ${first.date.slice(0, 4)}`}
        </span>
        {first.title && <span className="font-serif text-[17px] leading-snug font-semibold">{first.title}</span>}
        <span className="prose-serif line-clamp-3 text-[16px] leading-[1.6] text-fg/85">
          {first.excerpt || (!first.title && "Sin texto")}
        </span>
      </Link>

      {rest.length > 0 && (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5 border-t border-line pt-2">
          {rest.slice(0, 3).map((e) => (
            <li key={e.id}>
              <Link
                href={`/journal/${e.id}`}
                className="flex min-h-11 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-3 active:bg-surface-3"
              >
                <span className="tabular min-w-[78px] shrink-0 text-[13px] text-muted">
                  {formatShort(e.date)}
                  {showYear(e.date) && ` ${e.date.slice(0, 4)}`}
                </span>
                <span className="min-w-0 flex-1 truncate font-serif text-[15px]">{e.title || e.excerpt || "Sin texto"}</span>
                {e.mood && (
                  <span className="shrink-0 text-muted">
                    <MoodIcon mood={e.mood} size={18} />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Vacío ──────────────────────────────────────────────────────────────────

export function EmptyJournal() {
  const { pending, write } = useWrite();
  return (
    <div className="grid justify-items-start gap-3 rounded-card card p-8">
      <span className="inline-flex size-10 items-center justify-center rounded-[12px] bg-accent-soft text-accent-fg">
        <PenNib size={22} aria-hidden />
      </span>
      <h2 className="font-serif text-[22px] leading-tight font-semibold tracking-tight">Todavía no escribiste nada</h2>
      <p className="max-w-[46ch] text-sm leading-relaxed text-muted">
        Una entrada por día alcanza. Contá qué pasó, cómo te sentiste y qué te quedó dando vueltas. Se guarda sola mientras escribís.
      </p>
      <Button variant="accent" onClick={() => write()} disabled={pending}>
        <PenNib size={16} weight="bold" /> Escribir la primera
      </Button>
    </div>
  );
}
