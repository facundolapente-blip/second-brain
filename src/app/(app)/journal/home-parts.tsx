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
          <div className="mx-auto flex h-16 max-w-3xl items-center gap-2 px-4 lg:h-24 lg:max-w-6xl lg:px-10">
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
              className="display h-11 min-w-0 flex-1 bg-transparent text-[22px] outline-none! placeholder:text-faint"
            />
            <button type="button" onClick={closeSearch} className="h-11 shrink-0 px-2 text-sm font-medium text-accent-fg">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <Sheet ref={sheet} title="Filtrar">
        <div className="grid gap-6">
          <section className="grid gap-2.5">
            <h3 className="kicker">Ánimo</h3>
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
                      "grid min-h-16 justify-items-center gap-1 rounded-[4px] py-2.5 text-[12px] transition-colors",
                      on ? "bg-accent-soft font-medium text-accent-fg" : "text-muted hover:bg-surface-2",
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
            <h3 className="kicker">Etiqueta</h3>
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
                        "h-9 rounded-full border px-3 text-[13px] transition-colors",
                        on ? "border-accent bg-accent-soft font-medium text-accent-fg" : "border-line-strong text-fg hover:bg-surface-2",
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
      className="rise relative grid grid-cols-[minmax(0,1fr)] gap-4 border-y border-line py-5"
      style={{ "--i": 1 } as React.CSSProperties}
    >
      <div className="grid min-w-0 gap-1 pr-12">
        <h2 className="kicker flex items-center gap-1.5 text-accent-fg!">
          <ClockCounterClockwise size={14} weight="bold" aria-hidden />
          {title}
        </h2>
        <p className="text-[14px] text-muted">{line}</p>
      </div>
      <IconButton label="Cerrar recuerdo por hoy" onClick={dismiss} className="absolute top-3 right-0">
        <X size={16} />
      </IconButton>

      <Link
        href={`/journal/${first.id}`}
        className="group grid gap-2 border-l-[1.5px] border-accent/50 py-1 pr-2 pl-5 transition-colors hover:border-accent lg:pl-6"
      >
        <span className="kicker">
          {memory.kind === "years" ? `${yearsAgo(first.date, today)}, ` : ""}
          {formatShort(first.date)}
          {showYear(first.date) && ` ${first.date.slice(0, 4)}`}
        </span>
        {first.title && <span className="display text-[22px] leading-snug">{first.title}</span>}
        <span className="prose-serif line-clamp-3 text-[19px] leading-[1.55] text-fg/90">
          {first.excerpt || (!first.title && "Sin texto")}
        </span>
      </Link>

      {rest.length > 0 && (
        <ul className="grid grid-cols-[minmax(0,1fr)] divide-y divide-line border-t border-line">
          {rest.slice(0, 3).map((e) => (
            <li key={e.id}>
              <Link
                href={`/journal/${e.id}`}
                className="flex min-h-11 items-center gap-3 px-1 py-2 transition-colors hover:bg-surface-2 active:bg-surface-2"
              >
                <span className="min-w-[84px] shrink-0 font-mono text-[11.5px] text-muted tabular">
                  {formatShort(e.date)}
                  {showYear(e.date) && ` ${e.date.slice(0, 4)}`}
                </span>
                <span className="min-w-0 flex-1 truncate font-serif text-[16px]">{e.title || e.excerpt || "Sin texto"}</span>
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
    <div className="grid justify-items-start gap-3 border-y border-line py-10">
      <p className="kicker flex items-center gap-1.5">
        <PenNib size={14} aria-hidden /> Primera página
      </p>
      <h2 className="display text-[32px]">Todavía no escribiste nada</h2>
      <p className="max-w-[52ch] text-[15px] leading-relaxed text-muted">
        Una entrada por día alcanza. Contá qué pasó, cómo te sentiste y qué te quedó dando vueltas. Se guarda sola mientras escribís.
      </p>
      <Button variant="accent" onClick={() => write()} disabled={pending}>
        <PenNib size={16} weight="bold" /> Escribir la primera
      </Button>
    </div>
  );
}
