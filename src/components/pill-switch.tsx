"use client";

import Link from "next/link";
import { useState } from "react";
import { cx } from "./ui";

/**
 * Selector en píldora (dos a cuatro opciones del mismo ancho) con una marca que
 * se desliza a la opción elegida, como `Segmented` pero redondo. Con `hrefOf`
 * cada opción es un enlace (cambia la dirección) y la marca se mueve al tocar,
 * sin esperar a que llegue la página nueva.
 */
export function PillSwitch<T extends string>({
  label,
  value,
  options,
  onChange,
  hrefOf,
  className,
  track = "bg-surface-2",
  thumb = "bg-raised shadow-[0_1px_2px_rgba(var(--shadow-tint),0.12)]",
  on = "text-fg",
  off = "text-muted hover:text-fg",
  item = "h-8 px-3 text-[13px]",
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange?: (v: T) => void;
  hrefOf?: (v: T) => string;
  className?: string;
  track?: string;
  thumb?: string;
  on?: string;
  off?: string;
  item?: string;
}) {
  // Con enlaces, la marca se adelanta al toque (la página nueva tarda un poco).
  const [picked, setPicked] = useState<T | null>(null);
  const [from, setFrom] = useState(value);
  if (from !== value) {
    setFrom(value);
    setPicked(null);
  }
  const current = picked ?? value;
  const index = Math.max(0, options.findIndex((o) => o.value === current));
  return (
    <div role="radiogroup" aria-label={label} className={cx("relative inline-grid auto-cols-fr grid-flow-col rounded-full p-1", track, className)}>
      <span
        aria-hidden
        className={cx(
          "pointer-events-none absolute inset-y-1 left-1 rounded-full transition-transform duration-[var(--dur-state)] ease-[var(--ease-out)] motion-reduce:transition-none",
          thumb,
        )}
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => {
        const active = current === o.value;
        const cls = cx("relative z-[1] inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors duration-[var(--dur-quick)]", item, active ? on : off);
        return hrefOf ? (
          <Link key={o.value} href={hrefOf(o.value)} role="radio" aria-checked={active} onClick={() => setPicked(o.value)} className={cls} scroll={false}>
            {o.label}
          </Link>
        ) : (
          <button key={o.value} type="button" role="radio" aria-checked={active} onClick={() => onChange?.(o.value)} className={cls}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
