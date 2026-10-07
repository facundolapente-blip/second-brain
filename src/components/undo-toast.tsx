"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { undoLastDelete } from "@/lib/trash-actions";

/**
 * Aviso de abajo después de borrar: "Movimiento borrado · Deshacer". Lo borrado
 * ya está en la papelera; Deshacer lo restaura (`undoLastDelete`). Las server
 * actions de una pestaña van en fila, así que el deshacer corre después del borrado.
 */
const EVENT = "sb:borrado";
const MS = 6000;

export function notifyDeleted(label: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: label }));
}

export function UndoToast() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ label: string; key: number; done?: string } | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const h = (e: Event) => {
      setMsg({ label: (e as CustomEvent<string>).detail, key: Date.now() });
    };
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!msg || pending) return;
    timer.current = setTimeout(() => setMsg(null), msg.done ? 2500 : MS);
    return () => clearTimeout(timer.current);
  }, [msg, pending]);

  if (!msg) return null;
  return (
    <div
      role="status"
      key={msg.key}
      className="toast-in fixed inset-x-4 bottom-[calc(92px+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-sm items-center gap-3 rounded-full bg-[var(--text)] py-2 pr-2 pl-5 text-[14px] text-[var(--bg)] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)] lg:bottom-6 print:hidden"
    >
      <span className="min-w-0 flex-1 truncate">{msg.done ?? msg.label}</span>
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
