"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwise, WarningCircle } from "@phosphor-icons/react";
import { cx } from "./ui";
import { undoLastDelete } from "@/lib/trash-actions";

/**
 * Aviso de abajo después de borrar: "Movimiento borrado · Deshacer". Lo borrado
 * ya está en la papelera; Deshacer lo restaura (`undoLastDelete`). Las server
 * actions de una pestaña van en fila, así que el deshacer corre después del borrado.
 */
const EVENT = "sb:borrado";
const EVENT_ERROR = "sb:error";
const EVENT_INFO = "sb:info";
const MS = 6000;

export function notifyDeleted(label: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: label }));
}

/** El mismo aviso de abajo, para confirmar algo ("Bloque duplicado"), sin botón. */
export function notifyInfo(text: string) {
  window.dispatchEvent(new CustomEvent(EVENT_INFO, { detail: text }));
}

/** El mismo aviso de abajo, para cuando algo no se pudo guardar (sin botón). */
export function notifyError(text: string) {
  window.dispatchEvent(new CustomEvent(EVENT_ERROR, { detail: text }));
}

export function UndoToast() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ label: string; key: number; done?: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const h = (e: Event) => {
      setMsg({ label: (e as CustomEvent<string>).detail, key: Date.now() });
    };
    const he = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      setMsg({ label: text, done: text, error: true, key: Date.now() });
    };
    const hi = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      setMsg({ label: text, done: text, key: Date.now() });
    };
    window.addEventListener(EVENT, h);
    window.addEventListener(EVENT_ERROR, he);
    window.addEventListener(EVENT_INFO, hi);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener(EVENT_ERROR, he);
      window.removeEventListener(EVENT_INFO, hi);
    };
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!msg || pending) return;
    timer.current = setTimeout(() => setMsg(null), msg.error ? 5000 : msg.done ? 2500 : MS);
    return () => clearTimeout(timer.current);
  }, [msg, pending]);

  if (!msg) return null;
  return (
    <div
      role={msg.error ? "alert" : "status"}
      key={msg.key}
      className={cx(
        "toast-in fixed inset-x-4 bottom-[calc(92px+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-sm items-center gap-3 bg-[var(--text)] py-2 pr-2 pl-5 text-[14px] text-[var(--bg)] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)] lg:bottom-6 print:hidden",
        msg.error ? "rounded-2xl pr-5" : "rounded-full",
      )}
    >
      {msg.error && <WarningCircle size={18} weight="fill" className="-ml-1 shrink-0" aria-hidden />}
      <span className={cx("min-w-0 flex-1", msg.error ? "py-1 leading-snug" : "truncate")}>{msg.done ?? msg.label}</span>
      {!msg.done && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await undoLastDelete();
              setMsg((m) => m && { ...m, done: r.ok ? "Listo, volvió a su lugar" : r.error });
              router.refresh();
            })
          }
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--bg)_16%,transparent)] px-3.5 font-medium transition-colors hover:bg-[color-mix(in_oklab,var(--bg)_26%,transparent)] disabled:opacity-60"
        >
          <ArrowCounterClockwise size={15} weight="bold" aria-hidden />
          {pending ? "Restaurando…" : "Deshacer"}
        </button>
      )}
    </div>
  );
}
