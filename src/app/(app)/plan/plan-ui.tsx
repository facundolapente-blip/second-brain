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

/**
 * Prioridad 0 a 4: se muestra con puntos (1 a 4 llenos, en el color de
 * cada nivel); la palabra queda para el lector de pantalla y el cartelito.
 */
export const PRIORITIES: { value: number; label: string; tone: string }[] = [
  { value: 1, label: "Baja", tone: "stone" },
  { value: 2, label: "Media", tone: "blue" },
  { value: 3, label: "Alta", tone: "orange" },
  { value: 4, label: "Urgente", tone: "red" },
];

/** Las cuatro barras que crecen; llenas hasta el nivel. `mono`: en el color del texto (sobre fondos de color). */
/** Cuatro puntos, llenos hasta el nivel. `size`: diámetro en px. `mono`: en el color del texto (sobre fondos de color). */
export function PriorityDots({ n, size = 10, mono }: { n: number; size?: number; mono?: boolean }) {
  const p = PRIORITIES.find((x) => x.value === n);
  if (!p) return null;
  return (
    <span aria-hidden style={mono ? undefined : tone(p.tone)} className="inline-flex items-center">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cx("rounded-full", i <= n && !mono && "prio-on")}
          style={{
            width: size,
            height: size,
            marginLeft: i > 1 ? Math.max(2, Math.round(size * 0.4)) : 0,
            background:
              i <= n
                ? mono
                  ? "currentColor"
                  : undefined
                : mono
                  ? "color-mix(in oklab, currentColor 28%, transparent)"
                  : "var(--border-strong)",
          }}
        />
      ))}
    </span>
  );
}

export function PriorityTag({ n }: { n: number }) {
  const p = PRIORITIES.find((x) => x.value === n);
  if (!p) return null;
  const label = `Prioridad ${p.label.toLowerCase()}`;
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex h-6 items-center px-0.5">
      <PriorityDots n={n} />
    </span>
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
            aria-label={p.label}
            title={p.label}
            style={tone(p.tone)}
            className={cx(
              "inline-flex h-11 w-14 items-center justify-center rounded-full border transition-colors",
              on ? "border-[var(--tone-solid)] bg-tone ring-1 ring-[var(--tone-solid)]" : "border-line-strong hover:bg-surface-2",
            )}
          >
            <PriorityDots n={p.value} size={9} />
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
          className={cx("bar-anim block h-full rounded-full", pct >= 100 ? "bg-[var(--st-done-line)]" : "bg-accent")}
          style={{ width: `${pct}%` }}
        />
      </span>
      {label && <span className="shrink-0 font-mono text-[11.5px] text-muted tabular">{label}</span>}
    </span>
  );
}

/**
 * Pasos de una tarea en segmentos (uno por paso; con más de 10, barra). Cada
 * segmento se llena de izquierda a derecha al tildar (`.plan-seg`, solo al cambiar):
 * `track` da alto y radio de cada segmento, `gap` la separación.
 */
export function StepBar({ done, total, track = "h-3 rounded-[3px]", gap = "gap-1" }: { done: number; total: number; track?: string; gap?: string }) {
  const fill = done >= total ? "bg-[var(--st-done-line)]" : "bg-accent";
  if (total > 10)
    return (
      <span className={cx("min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3", track)} aria-hidden>
        <span className={cx("bar-anim block h-full rounded-full", fill)} style={{ width: `${Math.round((Math.min(done, total) / total) * 100)}%` }} />
      </span>
    );
  return (
    <span className={cx("flex min-w-0 flex-1", gap)} aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx("min-w-0 flex-1 overflow-hidden bg-surface-3", track)}>
          <span className={cx("plan-seg block h-full", fill)} style={i < done ? undefined : { scale: "0 1", opacity: 0 }} />
        </span>
      ))}
    </span>
  );
}

export function categoryMap(categories: CategoryDTO[]) {
  return new Map(categories.map((c) => [c.id, c]));
}
