"use client";

import { useEffect, useRef } from "react";
import { haptic } from "@/components/haptics";

/**
 * Botón de sumar o restar que repite si se lo mantiene apretado: un toque da un
 * paso (con el clic de siempre, también con teclado); apretado, a los 400 ms
 * empieza a repetir cada 120 ms, con una vibración corta en cada paso. Quien lo
 * usa guarda una sola vez al final (el check-in junta los toques seguidos en un
 * guardado; la hoja de cantidad guarda al cerrar). Devuelve props para el botón.
 *
 * `step` puede cambiar entre renders (con el valor del momento): se usa el último.
 */
export function useHoldRepeat(step: () => void) {
  const latest = useRef(step);
  useEffect(() => {
    latest.current = step;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeated = useRef(false);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  return {
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0) return;
      stop();
      repeated.current = false;
      const tick = () => {
        repeated.current = true;
        haptic("tap");
        latest.current();
        timer.current = setTimeout(tick, 120);
      };
      timer.current = setTimeout(tick, 400);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onClick() {
      // Después de repetir, el clic que llega al soltar no suma otro paso.
      if (repeated.current) {
        repeated.current = false;
        return;
      }
      haptic("tap");
      latest.current();
    },
    // Mantener apretado no abre el menú del celular ni selecciona texto.
    onContextMenu(e: React.MouseEvent) {
      e.preventDefault();
    },
  };
}

/** Clases para el botón que usa `useHoldRepeat` (mantener apretado no selecciona ni abre menús). */
export const HOLD_CLASS = "touch-manipulation select-none [-webkit-touch-callout:none]";
