"use client";

import { tone } from "@/lib/palette";
import type { CategoryDTO } from "@/lib/plan-logic";
import { cx } from "@/components/ui";

/**
 * Etiqueta llena (color de la paleta con texto claro, `.chip-solid` en
 * globals.css): la usan categoría, estado y prioridad para que se vean igual.
 */
function Chip({ toneKey, children, className, title }: { toneKey: string; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span
      style={tone(toneKey)}
      title={title}
      className={cx(
        "chip-solid inline-flex h-6 items-center rounded-md px-2 text-[12px] leading-none font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Etiqueta de categoría con su color, como los tags de Notion. */
export function CategoryTag({ category, className }: { category?: CategoryDTO | null; className?: string }) {
  if (!category) return null;
  return (
    <Chip toneKey={category.color} className={className}>
      {category.name}
    </Chip>
  );
}

/** Estado de una tarea, con un punto adelante. */
export function StatusPill({ label, toneKey }: { label: string; toneKey: string }) {
  return (
    <Chip toneKey={toneKey} className="gap-1.5 rounded-full pr-2.5 pl-2">
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      {label}
    </Chip>
  );
}

/** Prioridad 0 a 4 en palabras (antes eran fueguitos, como en Notion). */
export const PRIORITIES: { value: number; label: string; tone: string }[] = [
  { value: 1, label: "Baja", tone: "stone" },
  { value: 2, label: "Media", tone: "blue" },
  { value: 3, label: "Alta", tone: "orange" },
  { value: 4, label: "Urgente", tone: "red" },
];

export function PriorityTag({ n }: { n: number }) {
  const p = PRIORITIES.find((x) => x.value === n);
  if (!p) return null;
  return (
    <Chip toneKey={p.tone} title={`Prioridad ${p.label.toLowerCase()}`}>
      {p.label}
    </Chip>
  );
}

/** Selector de prioridad: tocar la elegida la saca (queda sin prioridad). */
export function PriorityPicker({ value, onChange, name }: { value: number; onChange: (n: number) => void; name?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Prioridad">
      {PRIORITIES.map((p) => {
        const on = value === p.value;
        return (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? 0 : p.value)}
            style={tone(p.tone)}
            className={cx(
              "inline-flex h-10 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors",
              on ? "chip-solid border-transparent" : "border-line-strong text-muted hover:text-fg",
            )}
          >
            {p.label}
          </button>
        );
      })}
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}

/** Avance como barra fina con el número al lado. */
export function ProgressBar({ pct, label }: { pct: number | null; label?: string }) {
  if (pct === null) return null;
  return (
    <span className="inline-flex min-w-0 flex-1 items-center gap-2.5" aria-label={`Avance ${pct}%`}>
      <span className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span
          className={cx("block h-full rounded-full", pct >= 100 ? "bg-[var(--st-done-line)]" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </span>
      {label && <span className="shrink-0 font-mono text-[11.5px] text-muted tabular">{label}</span>}
    </span>
  );
}

export function categoryMap(categories: CategoryDTO[]) {
  return new Map(categories.map((c) => [c.id, c]));
}
