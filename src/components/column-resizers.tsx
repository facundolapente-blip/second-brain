"use client";

import { useRef, useState } from "react";
import { cx } from "./ui";

/**
 * Bordes de las columnas, como en Notion: una franja invisible sobre cada borde, a todo el
 * alto de la tabla; al pasar el mouse o arrastrar se ve una línea de color. Arrastrar mueve
 * solo ese borde y sigue al mouse exacto (cambia solo esa columna; lo de la derecha se corre).
 * Se guarda al soltar. Con teclado: flechas. Va dentro de un contenedor `relative` que mide
 * lo mismo que la tabla (los bordes se ubican sumando los anchos).
 */
export function ColumnResizers<K extends string>({
  cols,
  onResize,
  className,
}: {
  cols: { key: K; label: string; width: number }[];
  onResize: (k: K, w: number, save: boolean) => void;
  className?: string;
}) {
  const drag = useRef<{ key: K; x: number; w: number } | null>(null);
  const [active, setActive] = useState<K | null>(null);
  // Dónde termina cada columna (suma de los anchos hasta ella).
  const ends = cols.map((_, i) => cols.slice(0, i + 1).reduce((a, c) => a + c.width, 0));
  return (
    <div className={cx("pointer-events-none absolute inset-0", className)}>
      {cols.map((c, i) => {
        const on = active === c.key;
        return (
          <span
            key={c.key}
            role="separator"
            aria-orientation="vertical"
            aria-label={`Ancho de ${c.label}`}
            aria-valuenow={c.width}
            tabIndex={0}
            // El último borde va adentro de la tabla (afuera lo corta el contenedor).
            style={{ left: ends[i] - (i === cols.length - 1 ? 10 : 5) }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              drag.current = { key: c.key, x: e.clientX, w: c.width };
              setActive(c.key);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (d) onResize(d.key, d.w + e.clientX - d.x, false);
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              drag.current = null;
              setActive(null);
              if (d) onResize(d.key, d.w + e.clientX - d.x, true);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setActive(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                onResize(c.key, c.width + (e.key === "ArrowRight" ? 16 : -16), true);
              }
            }}
            className="group/res pointer-events-auto absolute inset-y-0 z-10 flex w-[10px] cursor-col-resize touch-none justify-center outline-none"
          >
            <span
              className={cx(
                "h-full w-[3px] transition-colors",
                on ? "bg-accent" : "bg-transparent group-hover/res:bg-accent/70 group-focus-visible/res:bg-accent",
              )}
            />
          </span>
        );
      })}
    </div>
  );
}
