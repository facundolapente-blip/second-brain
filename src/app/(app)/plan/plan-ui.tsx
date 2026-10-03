"use client";

import { Fire } from "@phosphor-icons/react";
import { tone } from "@/lib/palette";
import type { CategoryDTO } from "@/lib/plan-logic";
import { cx } from "@/components/ui";

/** Etiqueta de categoría con su color, como los tags de Notion. */
export function CategoryTag({ category, className }: { category?: CategoryDTO | null; className?: string }) {
  if (!category) return null;
  return (
    <span
      style={tone(category.color)}
      className={cx(
        "inline-flex h-[22px] items-center rounded-[3px] bg-tone px-1.5 text-[12px] leading-none font-medium text-tone-fg",
        className,
      )}
    >
      {category.name}
    </span>
  );
}

/** Pastilla de estado con un tono de la paleta. */
export function StatusPill({ label, toneKey }: { label: string; toneKey: string }) {
  return (
    <span
      style={tone(toneKey)}
      className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-tone px-2 font-mono text-[10.5px] leading-none font-medium tracking-[0.06em] whitespace-nowrap text-tone-fg uppercase"
    >
      {label}
    </span>
  );
}

/** Prioridad en fueguitos (0 a 4). */
export function Fires({ n, size = 13 }: { n: number; size?: number }) {
  if (n <= 0) return null;
  return (
    <span className="inline-flex items-center text-[var(--p-orange-solid)]" aria-label={`Prioridad ${n} de 4`}>
      {Array.from({ length: n }, (_, i) => (
        <Fire key={i} size={size} weight="fill" aria-hidden />
      ))}
    </span>
  );
}

/** Selector de prioridad: tocás el fueguito que querés (tocar el mismo lo baja a 0). */
export function FirePicker({ value, onChange, name }: { value: number; onChange: (n: number) => void; name?: string }) {
  return (
    <div className="flex h-11 items-center gap-0.5" role="radiogroup" aria-label="Prioridad">
      {[1, 2, 3, 4].map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          aria-label={`${p} ${p === 1 ? "fueguito" : "fueguitos"}`}
          onClick={() => onChange(value === p ? 0 : p)}
          className={cx(
            "inline-flex size-11 items-center justify-center rounded-[4px] transition-colors",
            p <= value ? "text-[var(--p-orange-solid)]" : "text-faint hover:text-muted",
          )}
        >
          <Fire size={20} weight={p <= value ? "fill" : "regular"} />
        </button>
      ))}
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}

/** Avance en 10 cuadraditos, como la fórmula de Notion. */
export function ProgressSquares({ pct, label }: { pct: number | null; label?: string }) {
  if (pct === null) return null;
  const filled = Math.round(pct / 10);
  return (
    <span className="inline-flex items-center gap-2" aria-label={`Avance ${pct}%`}>
      <span className="inline-flex gap-[3px]" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cx("h-[10px] w-[7px] rounded-[1px]", i < filled ? "bg-[var(--st-done-line)]" : "bg-line-strong/70")}
          />
        ))}
      </span>
      {label && <span className="font-mono text-[11px] text-muted tabular">{label}</span>}
    </span>
  );
}

export function categoryMap(categories: CategoryDTO[]) {
  return new Map(categories.map((c) => [c.id, c]));
}
