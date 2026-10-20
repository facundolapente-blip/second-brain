"use client";

import { Star } from "@phosphor-icons/react";
import { cx } from "@/components/ui";
import { NOTE_STARS_MAX } from "@/lib/notes-logic";

/** Las estrellas de importancia, solo para ver (las llenas en amarillo). */
export function StarsShow({ n, size = 12 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-px" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <Star key={i} size={size} weight="fill" className="text-[var(--p-yellow-chip)]" />
      ))}
    </span>
  );
}

/** Elegir de 0 a 3 estrellas: tocar la que ya está marcada como última la saca. */
export function StarsPicker({ value, onChange, size = 26 }: { value: number; onChange: (n: number) => void; size?: number }) {
  return (
    <div role="radiogroup" aria-label="Importancia" className="flex items-center gap-1">
      {Array.from({ length: NOTE_STARS_MAX }, (_, i) => {
        const n = i + 1;
        const on = value >= n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={n === 1 ? "1 estrella" : `${n} estrellas`}
            onClick={() => onChange(value === n ? 0 : n)}
            className="press inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
          >
            <Star size={size} weight={on ? "fill" : "regular"} className={cx(on ? "text-[var(--p-yellow-chip)]" : "text-faint")} />
          </button>
        );
      })}
      {value > 0 && (
        <button type="button" onClick={() => onChange(0)} className="ml-1 min-h-11 rounded-full px-2 text-[12.5px] text-muted hover:text-fg">
          Sacar
        </button>
      )}
    </div>
  );
}
