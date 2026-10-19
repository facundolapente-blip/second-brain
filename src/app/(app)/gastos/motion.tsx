"use client";

import { useState } from "react";
import { cx } from "@/components/ui";

/**
 * Movimiento propio de Gastos (las clases están en gastos.css). Como las piezas de
 * `components/motion.ts`: nada corre al cargar, solo cuando algo cambia en pantalla.
 */

/**
 * "fin-draw" desde el primer cambio de `key` (otro mes, período, moneda o cuentas).
 * El gráfico se vuelve a montar con `key` y sus barras crecen desde la base.
 */
export function useDraw(key: string): string | undefined {
  const [st, setSt] = useState({ key, changed: false });
  if (st.key !== key) {
    setSt({ key, changed: true });
    return "fin-draw";
  }
  return st.changed ? "fin-draw" : undefined;
}

/** Tic de una cifra que cambió: entra desde abajo si subió y desde arriba si bajó. */
function useTick(value: number): string | undefined {
  const [st, setSt] = useState<{ value: number; cls?: string }>({ value });
  if (st.value !== value) {
    const cls = value > st.value ? "count-tick" : "count-tick-down";
    setSt({ value, cls });
    return cls;
  }
  return st.cls;
}

/** Envuelve una cifra (saldo, total): al cambiar el valor hace un tic corto. Al cargar, nada. */
export function Tick({ value, className, children }: { value: number; className?: string; children: React.ReactNode }) {
  const cls = useTick(value);
  return (
    <span key={value} className={cx("inline-block", cls, className)}>
      {children}
    </span>
  );
}

/**
 * Ids que aparecieron desde el render anterior, pero solo mientras `scope` (el
 * período y las cuentas) sea el mismo: al cambiar de mes la lista entera ya entra
 * deslizándose y no hace falta marcar cada fila.
 */
export function useFreshIds(ids: string[], scope: string): Set<string> {
  const key = ids.join("|");
  const [st, setSt] = useState(() => ({ key, scope, seen: new Set(ids), fresh: new Set<string>() }));
  if (st.key !== key || st.scope !== scope) {
    const fresh = st.scope !== scope ? new Set<string>() : new Set(ids.filter((id) => !st.seen.has(id)));
    setSt({ key, scope, seen: new Set(ids), fresh });
    return fresh;
  }
  return st.fresh;
}

/**
 * Capa para lo que sigue al puntero en un gráfico (tooltip, línea vertical): se
 * corre con `translate` (porcentaje del ancho del gráfico) y se desliza entre
 * posiciones en vez de saltar. La capa de afuera recorta con 12 px de margen, así
 * lo que asoma por los bordes no ensancha la página.
 */
export function PointerTrack({ at, children }: { at: number; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute -inset-3 z-10 overflow-hidden">
      <div className="fin-track absolute inset-3" style={{ translate: `${(at * 100).toFixed(3)}% 0` }}>
        {children}
      </div>
    </div>
  );
}
