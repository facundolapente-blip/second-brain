"use client";

import { useEffect, useRef } from "react";
import { notifyError } from "./undo-toast";

type Result = { ok: boolean; error?: string } | null | undefined;

/** Foto de lo que tiene el formulario, para saber si cambió algo. */
function snapshot(f: HTMLFormElement) {
  return JSON.stringify([...new FormData(f).entries()].map(([k, v]) => [k, typeof v === "string" ? v : v.name]));
}

/**
 * Guardar al cerrar una hoja sin tocar "Guardar" (tocar afuera, la X, Escape o
 * arrastrarla hacia abajo): si el formulario cambió y es válido, lo manda.
 * Una tarea o bloque nuevo sin nombre se descarta. Si el guardado falla con la
 * hoja ya cerrada, avisa abajo.
 *
 * Uso: `const { form, onDismiss } = useSaveOnDismiss(state)`, `<form ref={form}>`
 * y pasar `onDismiss` a la hoja (`<Sheet onDismiss>`).
 */
export function useSaveOnDismiss(state: Result) {
  const form = useRef<HTMLFormElement>(null);
  const initial = useRef<string | null>(null);
  const dismissed = useRef(false);
  useEffect(() => {
    if (form.current) initial.current = snapshot(form.current);
  }, []);
  useEffect(() => {
    if (!dismissed.current || !state) return;
    dismissed.current = false;
    if (!state.ok) notifyError(`No se guardó: ${state.error ?? "probá de nuevo"}`);
  }, [state]);
  function onDismiss() {
    const f = form.current;
    if (!f || snapshot(f) === initial.current || !f.checkValidity()) return;
    dismissed.current = true;
    f.requestSubmit();
  }
  return { form, onDismiss };
}
