"use client";

import { useState } from "react";

/**
 * Arrastre nativo de la compu con movimiento propio (auditoría 2026-10-19):
 *
 * - `liftImage`: en vez de la imagen translúcida del navegador, una copia de la
 *   tarjeta levantada (sombra y escala 1,02) que sigue al mouse.
 * - `land`: al soltar, la tarjeta viaja corto (≈180 ms, solo `transform`) desde
 *   donde se soltó hasta su lugar nuevo (FLIP). Mientras viaja no entra con
 *   `reveal` (`isLanding`).
 * - `ringWhileMenu`: la tarjeta del clic derecho queda marcada mientras el menú
 *   está abierto.
 *
 * Con movimiento reducido no hay viaje (la tarjeta aparece en su lugar).
 */

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Dónde se agarró la tarjeta (px desde su esquina) y cuánto medía: para saber de dónde sale el viaje al soltar. */
let grab: { x: number; y: number; src: DOMRect } | null = null;

/**
 * Imagen de arrastre: una copia de `el` con sombra y apenas más grande, agarrada
 * del mismo punto. `node` reemplaza la copia por otra pieza ya armada (para una
 * fila de tabla, que fuera de la tabla se ve rota): se agarra de su esquina.
 */
export function liftImage(e: React.DragEvent, el: HTMLElement, node?: HTMLElement) {
  const r = el.getBoundingClientRect();
  const x = node ? 20 : Math.max(0, Math.min(r.width, e.clientX - r.left));
  const y = node ? 18 : Math.max(0, Math.min(r.height, e.clientY - r.top));
  grab = { x, y, src: r };
  const wrap = document.createElement("div");
  // Afuera de la pantalla, con lugar para la sombra (el navegador saca la foto de este recuadro).
  Object.assign(wrap.style, { position: "fixed", top: "-2000px", left: "-2000px", padding: "16px", pointerEvents: "none" });
  const copy = node ?? (el.cloneNode(true) as HTMLElement);
  copy.removeAttribute("data-leave");
  copy.removeAttribute("data-flip");
  copy.removeAttribute("data-menu-ring");
  const cs = getComputedStyle(el);
  Object.assign(copy.style, {
    ...(node ? {} : { width: `${r.width}px`, height: `${r.height}px` }),
    boxSizing: "border-box",
    transform: "scale(1.02)",
    transformOrigin: `${x}px ${y}px`,
    boxShadow: "0 18px 40px -14px rgba(0,0,0,0.38), 0 2px 6px rgba(0,0,0,0.10)",
    borderRadius: node ? "12px" : cs.borderRadius || "12px",
    background: node || cs.backgroundColor === "rgba(0, 0, 0, 0)" ? "var(--surface)" : cs.backgroundColor,
    opacity: "1",
  });
  wrap.appendChild(copy);
  // Dentro del módulo, así toma sus colores (data-module).
  (el.closest("[data-module]") ?? document.body).appendChild(wrap);
  try {
    e.dataTransfer.setDragImage(wrap, x + 16, y + 16);
  } catch {
    // Sin setDragImage queda la imagen de siempre.
  }
  setTimeout(() => wrap.remove(), 0);
}

/** Una tarjeta chica con el nombre (y una línea más), para arrastrar una fila de la tabla. */
export function ghostCard(title: string, sub?: string): HTMLElement {
  const d = document.createElement("div");
  Object.assign(d.style, {
    padding: "10px 14px",
    border: "1px solid var(--border)",
    color: "var(--text)",
    font: "500 13.5px/1.3 var(--font-sans, system-ui)",
    maxWidth: "260px",
  });
  d.textContent = title;
  if (sub) {
    const s = document.createElement("div");
    Object.assign(s.style, { marginTop: "3px", font: "400 12px/1.2 var(--font-sans, system-ui)", color: "var(--muted)" });
    s.textContent = sub;
    d.appendChild(s);
  }
  return d;
}

const landing = new Set<string>();
/** ¿Esta tarjeta está viajando a su lugar? (Así no entra además con `reveal`.) */
export const isLanding = (id: string) => landing.has(id);

/**
 * De las claves recién aparecidas (`useNewIds`), las que llegaron con un viaje:
 * esas no llevan `reveal`. Se decide una vez por cada tanda nueva (si se mirara en
 * cada dibujo, al terminar el viaje la clase aparecería tarde y la tarjeta entraría dos veces).
 */
export function useLandedKeys(fresh: Set<string>, idOf: (key: string) => string): Set<string> {
  const pick = () => new Set([...fresh].filter((k) => landing.has(idOf(k))));
  const [st, setSt] = useState(() => ({ fresh, skip: pick() }));
  if (st.fresh !== fresh) {
    const next = { fresh, skip: pick() };
    setSt(next);
    return next.skip;
  }
  return st.skip;
}

/**
 * Al soltar: la tarjeta `id` (con `data-flip={id}`) viaja desde donde se soltó
 * hasta su lugar nuevo. Espera unos cuadros a que aparezca o se mueva (lo
 * optimista se dibuja después del evento).
 */
export function land(id: string, e: { clientX: number; clientY: number }, ms = 180) {
  const g = grab;
  grab = null;
  if (reduced() || !g) return;
  const from = { left: e.clientX - g.x, top: e.clientY - g.y };
  const srcEl = document.querySelector<HTMLElement>(`[data-flip="${CSS.escape(id)}"]`);
  const srcRect = srcEl?.getBoundingClientRect();
  landing.add(id);
  let frames = 0;
  const tick = () => {
    const el = document.querySelector<HTMLElement>(`[data-flip="${CSS.escape(id)}"]`);
    const r = el?.getBoundingClientRect();
    const moved = !!el && !!r && (el !== srcEl || !srcRect || Math.abs(r.left - srcRect.left) > 1 || Math.abs(r.top - srcRect.top) > 1);
    if (!moved) {
      if (++frames < 30) requestAnimationFrame(tick);
      else landing.delete(id);
      return;
    }
    const dx = from.left - r!.left;
    const dy = from.top - r!.top;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
      landing.delete(id);
      return;
    }
    const a = el!.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(1.02)`, boxShadow: "0 18px 40px -14px rgba(0,0,0,0.3)" },
        { transform: "none", boxShadow: "0 0 0 rgba(0,0,0,0)" },
      ],
      { duration: ms, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
    a.onfinish = a.oncancel = () => landing.delete(id);
  };
  requestAnimationFrame(tick);
}

/** Viaje desde un rectángulo conocido (dnd-kit en el celular: dónde quedó la tarjeta levantada). */
export function landFrom(id: string, from: { left: number; top: number } | null | undefined, ms = 200) {
  if (reduced() || !from) return;
  grab = { x: 0, y: 0, src: new DOMRect() };
  land(id, { clientX: from.left, clientY: from.top }, ms);
}

/**
 * Clic derecho: la tarjeta queda con un aro de acento mientras el menú está
 * abierto (el menú es de components/context-menu.tsx; se mira si sigue en pantalla).
 */
export function ringWhileMenu(el: HTMLElement | null) {
  if (!el) return;
  document.querySelectorAll("[data-menu-ring]").forEach((x) => x.removeAttribute("data-menu-ring"));
  el.setAttribute("data-menu-ring", "");
  let seen = false;
  let n = 0;
  const id = setInterval(() => {
    const open = !!document.querySelector("div.fixed.min-w-52:is([role=menu],[role=dialog])");
    if (open) seen = true;
    // Si nunca apareció (dentro de un campo de texto queda el del navegador), se saca enseguida.
    if ((seen && !open) || (!seen && ++n > 6)) {
      el.removeAttribute("data-menu-ring");
      clearInterval(id);
    }
  }, 120);
}
