"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwise, WarningCircle } from "@phosphor-icons/react";
import { cx } from "./ui";
import { undoLastDelete } from "@/lib/trash-actions";
import { haptic } from "./haptics";

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

type Msg = { label: string; key: number; done?: string; error?: boolean; swap?: boolean };
/** Lo que dura la salida del aviso (igual que `--dur-quick` de .toast-out). */
const EXIT_MS = 170;

let toastSeq = 0;

export function UndoToast() {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Sale con una animación corta antes de desaparecer.
  const [leaving, setLeaving] = useState(false);
  // Con el mouse o el foco encima, el tiempo se frena (para alcanzar a tocar Deshacer).
  const [paused, setPaused] = useState(false);
  const deadline = useRef(0);
  const remaining = useRef(0);
  const lastMsg = useRef<Msg | null>(null);
  // El aviso anterior, cuando llega uno nuevo con ese a la vista: se asoma detrás y se va.
  const [ghost, setGhost] = useState<{ text: string; error?: boolean; key: number } | null>(null);
  const shown = useRef<{ msg: Msg | null; leaving: boolean }>({ msg: null, leaving: false });
  useEffect(() => {
    shown.current = { msg, leaving };
  });

  useEffect(() => {
    const show = (next: Omit<Msg, "key" | "swap">) => {
      const prev = shown.current;
      const visible = prev.msg && !prev.leaving;
      // Claves de un contador: dos avisos en el mismo milisegundo con Date.now() repetían clave.
      if (visible && prev.msg) setGhost({ text: prev.msg.done ?? prev.msg.label, error: prev.msg.error, key: ++toastSeq });
      setLeaving(false);
      setMsg({ ...next, key: ++toastSeq, swap: Boolean(visible) });
    };
    const h = (e: Event) => show({ label: (e as CustomEvent<string>).detail });
    const he = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      show({ label: text, done: text, error: true });
    };
    const hi = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      show({ label: text, done: text });
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
    if (!ghost) return;
    const t = setTimeout(() => setGhost(null), 240);
    return () => clearTimeout(t);
  }, [ghost]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (msg !== lastMsg.current) {
      lastMsg.current = msg;
      remaining.current = 0;
    }
    if (!msg || pending || paused) return;
    const ms = remaining.current > 0 ? remaining.current : totalMs(msg);
    deadline.current = Date.now() + ms;
    timer.current = setTimeout(() => {
      setLeaving(true);
      timer.current = setTimeout(() => setMsg(null), EXIT_MS);
    }, ms);
    return () => clearTimeout(timer.current);
  }, [msg, pending, paused]);

  function pause() {
    if (paused || leaving) return;
    remaining.current = Math.max(400, deadline.current - Date.now());
    setPaused(true);
  }
  function resume(e: React.PointerEvent | React.FocusEvent) {
    // Si el foco sigue adentro (pasó de un botón a otro), no.
    if ("relatedTarget" in e && e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    setPaused(false);
  }

  if (!msg) return null;
  const pill = "flex items-center gap-3 bg-[var(--text)] py-2 pr-2 pl-5 text-[14px] text-[var(--bg)] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)]";
  return (
    <div className="fixed inset-x-4 bottom-[calc(92px+env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm lg:bottom-6 print:hidden">
      {ghost && (
        <div key={`g${ghost.key}`} aria-hidden className={cx("toast-ghost absolute inset-x-0 bottom-0 min-h-[52px]", pill, ghost.error ? "rounded-2xl pr-5" : "rounded-full")}>
          <span className="min-w-0 flex-1 truncate">{ghost.text}</span>
        </div>
      )}
      <div
        role={msg.error ? "alert" : "status"}
        key={msg.key}
        onPointerEnter={pause}
        onPointerLeave={resume}
        onFocus={pause}
        onBlur={resume}
        className={cx(leaving ? "toast-out" : msg.swap ? "toast-swap" : "toast-in", "relative overflow-hidden", pill, msg.error ? "rounded-2xl pr-5" : "rounded-full")}
      >
        {msg.error && <WarningCircle size={18} weight="fill" className="-ml-1 shrink-0" aria-hidden />}
        <span className={cx("min-w-0 flex-1", msg.error ? "py-1 leading-snug" : "truncate")}>{msg.done ?? msg.label}</span>
        {!msg.done && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                haptic("tap");
                try {
                  const r = await undoLastDelete();
                  haptic(r.ok ? "success" : "error");
                  setMsg((m) => m && { ...m, swap: true, done: r.ok ? "Listo, volvió a su lugar" : r.error });
                  router.refresh();
                } catch {
                  // Sin señal o sesión vencida: que no mande la pantalla a "No se pudo cargar".
                  haptic("error");
                  setMsg((m) => m && { ...m, swap: true, done: "No se pudo deshacer (sin conexión). Está en Historial y papelera.", error: true });
                }
              })
            }
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--bg)_16%,transparent)] px-3.5 font-medium transition-colors hover:bg-[color-mix(in_oklab,var(--bg)_26%,transparent)] disabled:opacity-60"
          >
            <ArrowCounterClockwise size={15} weight="bold" aria-hidden className={cx(pending && "motion-safe:animate-spin [animation-direction:reverse]")} />
            {pending ? "Restaurando…" : "Deshacer"}
          </button>
        )}
        {/* Cuánto falta para que se vaya (solo con Deshacer; con menos movimiento no se muestra). */}
        {!msg.done && !pending && (
          <span
            aria-hidden
            className={cx("toast-timer pointer-events-none absolute inset-x-6 bottom-0 h-[2px] rounded-full bg-[color-mix(in_oklab,var(--bg)_35%,transparent)] motion-reduce:hidden", paused && "[animation-play-state:paused]")}
            style={{ "--toast-ms": `${MS}ms` } as React.CSSProperties}
          />
        )}
      </div>
    </div>
  );
}

function totalMs(m: Msg) {
  return m.error ? 5000 : m.done ? 2500 : MS;
}
