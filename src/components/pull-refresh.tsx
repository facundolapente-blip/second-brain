"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import { flushQueue } from "@/lib/offline-queue";
import { flushActions } from "@/lib/offline/registry";
import { haptic } from "./haptics";
import { notifyInfo } from "./undo-toast";
import { cx } from "./ui";

/** Cuánto hay que tirar (lo que se ve, ya con la resistencia) para actualizar. */
const THRESHOLD = 70;
/** Tope de lo que baja el indicador y cuánto cuesta llegar (resistencia). */
const MAX = 120;
const K = 160;

/** ¿Arrancó en algo que tiene su propio scroll vertical, una hoja, el cajón o un campo? */
function blocked(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  if (!el) return true;
  if (el.closest("dialog, [role=dialog], [data-no-pull], input, textarea, select, [contenteditable='true']")) return true;
  if (document.querySelector("dialog[open]")) return true;
  for (let p: Element | null = el; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    if (p instanceof HTMLElement && p.scrollHeight > p.clientHeight + 1) {
      const oy = getComputedStyle(p).overflowY;
      if (oy === "auto" || oy === "scroll") return true;
    }
  }
  return false;
}

/**
 * Tirar para actualizar (solo celular). Arriba de todo de la página, tirar hacia
 * abajo baja un indicador que sigue al dedo con resistencia; pasado el umbral vibra
 * y, al soltar, sube lo que quedó sin conexión y pide los datos de nuevo
 * (`router.refresh()`), con el indicador girando mientras tanto. No arranca en hojas,
 * el cajón, campos ni en lo que tiene su propio scroll; si el gesto es de costado o
 * hacia arriba, no hace nada (el scroll sigue normal). Con movimiento reducido el
 * indicador no se mueve: aparece en su lugar con un fundido.
 * Va una sola vez, en el Shell.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ind = useRef<HTMLDivElement>(null);
  const icon = useRef<HTMLSpanElement>(null);
  const busy = useRef(false);

  // Termina cuando llegó la pantalla nueva (y se vio al menos un momento).
  const startedAt = useRef(0);
  useEffect(() => {
    if (!refreshing || isPending) return;
    const wait = Math.max(0, 500 - (Date.now() - startedAt.current));
    const t = setTimeout(() => {
      setRefreshing(false);
      busy.current = false;
      hide();
    }, wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshing, isPending]);

  function reduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function paint(shown: number, animate?: string) {
    const el = ind.current;
    if (!el) return;
    const p = Math.min(1, shown / THRESHOLD);
    el.style.transition = animate ?? "none";
    el.style.opacity = String(shown <= 0 ? 0 : Math.min(1, p * 1.4));
    el.style.transform = reduced() ? "translate3d(-50%, 16px, 0)" : `translate3d(-50%, ${shown - 44}px, 0) scale(${0.7 + 0.3 * p})`;
    if (icon.current) {
      icon.current.style.transform = reduced() ? "" : `rotate(${p * 270}deg)`;
      icon.current.style.opacity = String(0.4 + 0.6 * p);
    }
    el.dataset.past = shown >= THRESHOLD ? "true" : "false";
  }
  function hide() {
    paint(0, reduced() ? "opacity 120ms ease-out" : "transform 260ms var(--ease-in), opacity 200ms ease-in");
  }

  useEffect(() => {
    const mobile = window.matchMedia("(hover: none) and (pointer: coarse) and (max-width: 1023px)");
    let g: { x: number; y: number; on: boolean; dead: boolean; shown: number; past: boolean } | null = null;

    const start = (e: TouchEvent) => {
      g = null;
      if (busy.current || !mobile.matches || e.touches.length !== 1) return;
      if (window.scrollY > 0 || blocked(e.target)) return;
      const t = e.touches[0];
      g = { x: t.clientX, y: t.clientY, on: false, dead: false, shown: 0, past: false };
    };
    const move = (e: TouchEvent) => {
      if (!g || g.dead) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.on) {
        // Hacia arriba (scroll normal), de costado o con la página ya bajada: no es un tirón.
        if (dy < -4 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
          if (Math.abs(dx) > 8 || dy < -4) g.dead = true;
          return;
        }
        // Desde el primer movimiento: si el navegador ya arrancó su gesto, después no se puede frenar.
        if (e.cancelable && dy > 0) e.preventDefault();
        if (dy < 10) return;
        g.on = true;
        g.y = t.clientY - 10;
      }
      const d = Math.max(0, t.clientY - g.y);
      if (e.cancelable) e.preventDefault(); // sin el rebote del navegador mientras se tira
      g.shown = MAX * (1 - Math.exp(-d / K));
      const past = g.shown >= THRESHOLD;
      if (past && !g.past) haptic("threshold");
      g.past = past;
      paint(g.shown);
    };
    const end = () => {
      const s = g;
      g = null;
      if (!s?.on) return;
      if (!s.past) return hide();
      busy.current = true;
      startedAt.current = Date.now();
      // Queda girando un poco más abajo del borde mientras se actualiza.
      paint(THRESHOLD - 8, reduced() ? "opacity 120ms ease-out" : "transform 300ms var(--ease-spring), opacity 160ms ease-out");
      setRefreshing(true);
      void (async () => {
        let sent = 0;
        if (navigator.onLine) {
          try {
            sent = (await flushQueue()) + (await flushActions());
          } catch {
            // Lo que no subió queda en la cola: se reintenta solo.
          }
        }
        if (sent > 0) notifyInfo(sent === 1 ? "Se subió 1 cambio hecho sin conexión." : `Se subieron ${sent} cambios hechos sin conexión.`);
        startTransition(() => router.refresh());
      })();
    };
    const cancel = () => {
      const s = g;
      g = null;
      if (s?.on) hide();
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end, { passive: true });
    document.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <div
      ref={ind}
      aria-hidden={!refreshing}
      role={refreshing ? "status" : undefined}
      className="pull-indicator pointer-events-none fixed top-[env(safe-area-inset-top)] left-1/2 z-50 inline-flex size-10 items-center justify-center rounded-full border border-line bg-raised text-fg opacity-0 shadow-[0_6px_18px_-8px_rgba(var(--shadow-tint),0.4)] lg:hidden print:hidden"
      style={{ transform: "translate3d(-50%, -44px, 0)" }}
    >
      <span ref={icon} className="inline-flex">
        <ArrowClockwise size={20} weight="bold" className={cx(refreshing && "pull-spin")} />
      </span>
      {refreshing && <span className="sr-only">Actualizando…</span>}
    </div>
  );
}
