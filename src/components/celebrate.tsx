"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Devuelve un número que sube cada vez que `done` pasa de falso a verdadero
 * después de montar (no al cargar la página). Sirve de `key` para disparar el
 * festejo solo cuando la persona marca algo.
 */
export function useJustDone(done: boolean) {
  const [prev, setPrev] = useState(done);
  const [shot, setShot] = useState(0);
  // Estado derivado en el render (patrón de React para "valor anterior"), sin efectos.
  if (done !== prev) {
    setPrev(done);
    if (done) setShot(shot + 1);
  }
  return shot;
}

/** Verdadero desde que `value` cambia por primera vez después de montar. */
export function useHasChanged<T>(value: T) {
  const [initial] = useState(value);
  const [changed, setChanged] = useState(false);
  if (!changed && value !== initial) setChanged(true);
  return changed;
}

const COLORS = [
  "var(--p-orange-solid)",
  "var(--p-purple-solid)",
  "var(--p-green-solid)",
  "var(--p-blue-solid)",
  "var(--p-pink-solid)",
  "var(--p-yellow-solid)",
];

/**
 * Festejo chico al completar: un anillo que se expande y ocho puntitos de
 * colores que salen disparados. Va dentro de un contenedor `relative`.
 * Con "reducir movimiento" no se dibuja nada.
 */
export function Burst({ shot, color = "var(--st-done-solid)", reach = 34 }: { shot: number; color?: string; reach?: number }) {
  const reduce = useReducedMotion();
  if (reduce || !shot) return null;
  return (
    <span key={shot} aria-hidden className="pointer-events-none absolute inset-0">
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ boxShadow: `0 0 0 3px ${color}` }}
        initial={{ scale: 0.9, opacity: 0.7 }}
        animate={{ scale: 1.7, opacity: 0 }}
        transition={{ duration: 0.55, ease: [0.2, 0.8, 0.3, 1] }}
      />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        return (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 -mt-[3px] -ml-[3px] size-[6px] rounded-full"
            style={{ background: COLORS[i % COLORS.length] }}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
            animate={{ x: Math.cos(a) * reach, y: Math.sin(a) * reach, scale: 1, opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.15, 0.9, 0.3, 1] }}
          />
        );
      })}
    </span>
  );
}
