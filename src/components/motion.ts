"use client";

import { useState } from "react";

/**
 * Ids que aparecieron desde el render anterior (el primero no cuenta: al cargar
 * no se anima nada). Sirve para que una fila nueva, movida o restaurada entre
 * con `reveal` en vez de aparecer de golpe.
 */
export function useNewIds(ids: string[]): Set<string> {
  const key = ids.join("|");
  const [state, setState] = useState<{ key: string; seen: Set<string>; fresh: Set<string> }>(() => ({
    key,
    seen: new Set(ids),
    fresh: new Set(),
  }));
  if (state.key !== key) {
    const fresh = new Set(ids.filter((id) => !state.seen.has(id)));
    setState({ key, seen: new Set(ids), fresh });
    return fresh;
  }
  return state.fresh;
}

/**
 * Lo que se borra se va con una salida corta (`.leave`) y recién después corre
 * `then` (la acción que lo saca de la lista). Si no se encuentra en pantalla, corre enseguida.
 */
export function leaveThen(selector: string, then: () => void, ms = 160) {
  const els = typeof document === "undefined" ? [] : [...document.querySelectorAll<HTMLElement>(selector)];
  if (!els.length) return then();
  for (const el of els) el.classList.add("leave");
  setTimeout(then, ms);
}

/**
 * Clase para lo que cambia de valor en la misma pantalla (mes, semana, día):
 * "plan-slide-next" si avanzó, "plan-slide-prev" si retrocedió, nada al cargar.
 * El valor se compara como texto (sirve para fechas YYYY-MM-DD o YYYY-MM).
 */
export function useSlide(value: string): string {
  const [st, setSt] = useState({ value, cls: "" });
  if (st.value !== value) {
    const cls = value > st.value ? "plan-slide-next" : "plan-slide-prev";
    setSt({ value, cls });
    return cls;
  }
  return st.cls;
}

/** "swap" (fundido corto) para contenido que se reemplaza, desde el primer cambio (nunca al cargar). */
export function useSwap(value: string): string | undefined {
  const [st, setSt] = useState({ value, changed: false });
  if (st.value !== value) {
    setSt({ value, changed: true });
    return "swap";
  }
  return st.changed ? "swap" : undefined;
}

/**
 * Para datos que dependen de dos cosas: si cambió `order` (un período, una fecha)
 * desliza hacia ese lado; si cambió `other` (cuentas elegidas, moneda) hace un fundido.
 */
export function useChangeMotion(order: string, other: string): string | undefined {
  const [st, setSt] = useState<{ order: string; other: string; cls?: string }>({ order, other });
  if (st.order !== order || st.other !== other) {
    const cls = st.order !== order ? (order > st.order ? "plan-slide-next" : "plan-slide-prev") : "swap";
    setSt({ order, other, cls });
    return cls;
  }
  return st.cls;
}
