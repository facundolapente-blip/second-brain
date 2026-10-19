"use client";

import { useEffect, useRef } from "react";
import { haptic } from "./haptics";

/**
 * ¿El toque arrancó en algo que tiene su propio gesto horizontal? Campos de
 * texto, gráficos, `[data-no-swipe]` o algo con scroll horizontal que de verdad
 * se desplaza. Lo comparten `useSwipe` y `SwipeRow`.
 */
export function blocksSwipe(target: EventTarget | null, stopAt?: Element | null): boolean {
  let el = target instanceof Element ? target : null;
  if (!el) return false;
  if (el.closest("[data-no-swipe], input, textarea, select, [contenteditable=''], [contenteditable='true'], canvas, [role=slider]")) return true;
  // Un gráfico (svg grande); los íconos también son svg pero chicos.
  const svg = el.closest("svg");
  if (svg) {
    let top: SVGSVGElement = svg;
    for (let p = svg.parentElement?.closest("svg"); p; p = p.parentElement?.closest("svg")) top = p;
    if (top.getBoundingClientRect().width > 96) return true;
  }
  while (el && el !== stopAt && el !== document.body) {
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

/** Margen de los bordes de la pantalla: ahí está el gesto de Atrás del sistema. */
export const EDGE_PX = 24;

/**
 * Deslizar de costado sobre un contenedor (cambiar de día, de mes). Devuelve
 * props táctiles para ponerle: `<div {...useSwipe({ onLeft, onRight })}>`.
 *
 * - `onLeft`: el dedo fue hacia la izquierda (lo que sigue); `onRight`: hacia la derecha.
 * - Dispara si el gesto supera `threshold` (60 px) o va a más de 0,4 px/ms, y es
 *   claramente más horizontal que vertical (el scroll vertical sigue igual).
 * - Ignora toques que arrancan a menos de 24 px del borde, dentro de
 *   `[data-no-swipe]`, campos, gráficos o algo con scroll horizontal.
 * - Solo táctil (eventos touch: el mouse no los produce). Al disparar, `haptic("select")`.
 */
export function useSwipe(opts: { onLeft?: () => void; onRight?: () => void; threshold?: number; disabled?: boolean }) {
  const o = useRef(opts);
  useEffect(() => {
    o.current = opts;
  });
  const g = useRef<{ x: number; y: number; t: number; dx: number; dy: number; dead: boolean } | null>(null);

  return {
    onTouchStart(e: React.TouchEvent) {
      g.current = null;
      if (o.current.disabled || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX < EDGE_PX || t.clientX > window.innerWidth - EDGE_PX) return;
      if (blocksSwipe(e.target, e.currentTarget)) return;
      g.current = { x: t.clientX, y: t.clientY, t: e.timeStamp, dx: 0, dy: 0, dead: false };
    },
    onTouchMove(e: React.TouchEvent) {
      const s = g.current;
      if (!s || s.dead) return;
      if (e.touches.length !== 1) {
        s.dead = true;
        return;
      }
      const t = e.touches[0];
      s.dx = t.clientX - s.x;
      s.dy = t.clientY - s.y;
      // Si arrancó vertical, es scroll: se abandona el gesto.
      if (Math.abs(s.dy) > 12 && Math.abs(s.dy) > Math.abs(s.dx)) s.dead = true;
    },
    onTouchEnd(e: React.TouchEvent) {
      const s = g.current;
      g.current = null;
      if (!s || s.dead || o.current.disabled) return;
      const { dx, dy } = s;
      const ax = Math.abs(dx);
      if (ax < 24 || ax < Math.abs(dy) * 1.8) return;
      const speed = ax / Math.max(1, e.timeStamp - s.t);
      if (ax < (o.current.threshold ?? 60) && speed <= 0.4) return;
      const fn = dx < 0 ? o.current.onLeft : o.current.onRight;
      if (!fn) return;
      haptic("select");
      fn();
    },
    onTouchCancel() {
      g.current = null;
    },
  };
}
