"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "./ui";

/**
 * Menú de clic derecho, uno solo para toda la app (`ContextMenuHost` en el Shell).
 * Una tarjeta lo abre con `onContextMenu={(e) => showContextMenu(e, items)}`.
 * "Cambiar nombre" (`rename`) cambia el menú por un campo ahí mismo: Enter
 * guarda, Escape cancela. Con teclado: tecla de menú o Shift+F10, flechas y Enter.
 */
export type ContextMenuItem =
  | { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean }
  | { label: string; icon?: React.ReactNode; rename: { value: string; onSave: (value: string) => void } }
  | {
      label: string;
      icon?: React.ReactNode;
      /** Día y horario ahí mismo (bloques del Plan). */
      schedule: {
        date: string;
        start: string | null;
        end: string | null;
        onSave: (date: string, start: string | null, end: string | null) => void;
      };
    };
type FormItem = Exclude<ContextMenuItem, { onSelect: () => void }>;

type Open = { x: number; y: number; title?: string; items: ContextMenuItem[]; key: number };
const EVENT = "sb:menu-contextual";

export function showContextMenu(e: React.MouseEvent, items: ContextMenuItem[], title?: string) {
  // Dentro de un campo de texto, el menú del navegador (copiar, pegar).
  if ((e.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
  e.preventDefault();
  e.stopPropagation();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  // Con teclado (tecla de menú) no hay posición del mouse: al lado de la tarjeta.
  const x = e.clientX || r.left + 16;
  const y = e.clientY || r.top + 16;
  window.dispatchEvent(new CustomEvent<Open>(EVENT, { detail: { x, y, title, items, key: Date.now() } }));
}

export function ContextMenuHost() {
  const [open, setOpen] = useState<Open | null>(null);
  const [renaming, setRenaming] = useState<FormItem | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const h = (e: Event) => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setOpen((e as CustomEvent<Open>).detail);
      setRenaming(null);
      setPos(null);
    };
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);

  // Que no se salga de la pantalla.
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(open.x, window.innerWidth - r.width - 8));
    const top = Math.max(8, Math.min(open.y, window.innerHeight - r.height - 8));
    setPos({ left, top });
  }, [open, renaming]);

  useEffect(() => {
    if (!open) return;
    const openedAt = performance.now();
    const close = (e?: Event) => {
      if (e && e.type === "pointerdown" && box.current?.contains(e.target as Node)) return;
      // Al abrir, el foco en el menú dispara un "scroll" del documento: ese no cuenta.
      if (e && e.type === "scroll" && performance.now() - openedAt < 400) return;
      setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(null);
        returnFocus.current?.focus?.();
      }
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Foco en el primer ítem al abrir (para el teclado).
  useEffect(() => {
    if (open && !renaming) box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
  }, [open, renaming]);

  if (!open) return null;

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div
      ref={box}
      key={open.key}
      role={renaming ? "dialog" : "menu"}
      aria-label={renaming ? renaming.label : open.title ?? "Opciones"}
      onKeyDown={renaming ? undefined : onMenuKey}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos?.left ?? open.x, top: pos?.top ?? open.y, visibility: pos ? "visible" : "hidden" }}
      className="fixed z-[60] min-w-52 overflow-hidden rounded-xl border border-line-strong bg-surface py-1 shadow-[0_14px_36px_-14px_rgba(var(--shadow-tint),0.45)] print:hidden"
    >
      {renaming && "schedule" in renaming ? (
        <ScheduleForm item={renaming} onDone={() => setOpen(null)} />
      ) : renaming && "rename" in renaming ? (
        <form
          className="grid gap-2 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = String(new FormData(e.currentTarget).get("nombre") ?? "").trim();
            if (v && v !== renaming.rename.value) renaming.rename.onSave(v);
            setOpen(null);
          }}
        >
          <label className="px-1 text-[12px] font-medium text-muted" htmlFor="menu-nombre">
            {renaming.label}
          </label>
          <input
            id="menu-nombre"
            name="nombre"
            autoFocus
            defaultValue={renaming.rename.value}
            onFocus={(e) => e.currentTarget.select()}
            maxLength={160}
            autoComplete="off"
            className="h-10 w-72 max-w-[80vw] rounded-lg border border-accent bg-surface px-3 text-[14px] outline-none ring-3 ring-[color-mix(in_oklab,var(--accent)_18%,transparent)]"
          />
          <span className="px-1 text-[11.5px] text-muted">Enter guarda · Esc cancela</span>
        </form>
      ) : (
        <>
          {open.title && <p className="truncate px-3.5 pt-1.5 pb-1 text-[12px] font-medium text-muted">{open.title}</p>}
          {open.items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                if ("rename" in it || "schedule" in it) setRenaming(it);
                else {
                  setOpen(null);
                  it.onSelect();
                }
              }}
              className={cx(
                "flex min-h-10 w-full items-center gap-2.5 px-3.5 text-left text-[14px] transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
                "danger" in it && it.danger ? "text-danger" : "text-fg",
              )}
            >
              <span className="inline-flex w-4 justify-center text-muted" aria-hidden>
                {it.icon}
              </span>
              {it.label}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

/** Suma días a "YYYY-MM-DD" (en UTC, sin corrimientos de zona). */
function shiftIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Día, desde y hasta en el mismo menú, con atajo de una semana para adelante o para atrás. */
function ScheduleForm({ item, onDone }: { item: Extract<ContextMenuItem, { schedule: unknown }>; onDone: () => void }) {
  const s = item.schedule;
  const [date, setDate] = useState(s.date);
  const [start, setStart] = useState(s.start ?? "");
  const [end, setEnd] = useState(s.end ?? "");
  // Cambiar el "desde" corre el "hasta" igual (mantiene lo que dura).
  function onStart(v: string) {
    if (v && start && end) {
      const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      const e = Math.min(23 * 60 + 59, mins(v) + mins(end) - mins(start));
      setEnd(`${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`);
    }
    setStart(v);
  }
  const field = "h-10 rounded-lg border border-line-strong bg-surface px-2.5 text-[14px] outline-none focus:border-accent";
  return (
    <form
      className="grid w-[19rem] max-w-[86vw] gap-2.5 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!date) return;
        s.onSave(date, start || null, start && end ? end : null);
        onDone();
      }}
    >
      <span className="px-0.5 text-[12px] font-medium text-muted">{item.label}</span>
      <label className="grid gap-1 text-[12px] text-muted">
        Día
        <input type="date" required autoFocus value={date} onChange={(e) => setDate(e.target.value)} className={field} />
      </label>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => date && setDate(shiftIso(date, -7))} className="h-9 flex-1 rounded-full border border-line-strong text-[12.5px] text-muted hover:bg-surface-2 hover:text-fg">
          −1 semana
        </button>
        <button type="button" onClick={() => date && setDate(shiftIso(date, 7))} className="h-9 flex-1 rounded-full border border-line-strong text-[12.5px] font-medium text-fg hover:bg-surface-2">
          +1 semana
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-[12px] text-muted">
          Desde
          <input type="time" value={start} onChange={(e) => onStart(e.target.value)} className={field} />
        </label>
        <label className="grid gap-1 text-[12px] text-muted">
          Hasta
          <input type="time" value={end} disabled={!start} onChange={(e) => setEnd(e.target.value)} className={cx(field, "disabled:opacity-50")} />
        </label>
      </div>
      <span className="px-0.5 text-[11.5px] text-muted">Sin hora de inicio, queda para todo el día.</span>
      <button type="submit" className="h-10 rounded-full bg-[var(--text)] text-[14px] font-medium text-[var(--bg)] transition-opacity hover:opacity-90">
        Guardar
      </button>
    </form>
  );
}
