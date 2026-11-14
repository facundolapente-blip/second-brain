"use client";

import { useEffect, useRef } from "react";
import type { CheckinPatch } from "@/lib/checkin-logic";

/**
 * El ánimo y la energía se cargan desde dos lugares de Inicio (el ritual de la mañana y
 * "¿Cómo estás?") y son el mismo dato (`DailyCheckin`). Cada uno guarda lo suyo y avisa
 * por acá, así el otro lo muestra al toque sin esperar al servidor.
 */
const EVENT = "sb:checkin";
type Detail = { date: string; patch: CheckinPatch; from: string };

export function emitCheckin(date: string, patch: CheckinPatch, from: string) {
  window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail: { date, patch, from } }));
}

/** Lo que cargó el otro lugar (no lo propio). */
export function useCheckinSync(from: string, onPatch: (date: string, patch: CheckinPatch) => void) {
  const cb = useRef(onPatch);
  useEffect(() => {
    cb.current = onPatch;
  });
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Detail>).detail;
      if (d && d.from !== from) cb.current(d.date, d.patch);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [from]);
}
