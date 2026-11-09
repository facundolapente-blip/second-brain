"use client";

import { useEffect, useRef } from "react";
import { haptic } from "./haptics";

const clock = () => Date.now();

/**
 * Mantener apretado ~0,45 s sin mover el dedo abre el menú del clic derecho (en el
 * celular). Devuelve las props para el elemento. El toque que sigue al menú no
 * cuenta como un toque común, y el `contextmenu` que Android manda después del
 * mismo gesto no lo abre dos veces. En la compu, el clic derecho abre el mismo menú.
 */
export function useHoldMenu(open: (e: React.MouseEvent) => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const firedAt = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const fire = (el: HTMLElement) => {
    const s = start.current;
    if (!s) return;
    firedAt.current = clock();
    haptic("threshold");
    // El menú compartido espera un evento de mouse: alcanza con la posición y el elemento.
    open({ target: el, currentTarget: el, clientX: s.x, clientY: s.y, preventDefault() {}, stopPropagation() {} } as unknown as React.MouseEvent);
  };
  return {
    onTouchStartCapture: (e: React.TouchEvent) => {
      clearTimeout(timer.current);
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const el = e.currentTarget as HTMLElement;
      start.current = { x: t.clientX, y: t.clientY };
      timer.current = setTimeout(() => fire(el), ms);
    },
    onTouchMoveCapture: (e: React.TouchEvent) => {
      const s = start.current;
      const t = e.touches[0];
      if (s && t && Math.hypot(t.clientX - s.x, t.clientY - s.y) > 8) clearTimeout(timer.current);
    },
    onTouchEndCapture: (e: React.TouchEvent) => {
      clearTimeout(timer.current);
      // Ya se abrió el menú: el dedo que se levanta no es un toque en la fila.
      if (clock() - firedAt.current < 1500) e.preventDefault();
    },
    onTouchCancelCapture: () => clearTimeout(timer.current),
    onClickCapture: (e: React.MouseEvent) => {
      if (clock() - firedAt.current < 800) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (clock() - firedAt.current < 1500) return;
      open(e);
    },
  };
}
