"use client";

import { useEffect, useOptimistic, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSwipe } from "@/components/swipe";
import { cx } from "@/components/ui";

/**
 * Cambiar de mes, año o período sin esperar al servidor (Gastos y Journal).
 *
 * - El rótulo cambia y desliza al instante: el valor que se muestra es optimista
 *   (`useOptimistic`) y vuelve al de la URL cuando llegan los datos.
 * - Cada toque calcula desde el valor pendiente: tres toques rápidos son tres meses.
 * - Mientras tanto, la lista (`<NavDim>`) baja a 0,55 si a los 150 ms no llegó nada.
 * - El anterior y el siguiente quedan precargados (`router.prefetch`).
 * - Deslizar con el dedo sobre la pantalla (`usePeriodSwipe`) hace lo mismo que las
 *   flechas: manda un evento que escucha el navegador de períodos que esté a la vista.
 */

let inFlight = 0;
const subs = new Set<() => void>();
function subscribe(fn: () => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
function bump(d: number) {
  inFlight = Math.max(0, inFlight + d);
  for (const f of subs) f();
}

/** ¿Hay un cambio de período en camino? */
export function useNavPending(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => inFlight > 0,
    () => false,
  );
}

/**
 * Valor optimista + navegación en una transición. `go(next, href)` muestra `next`
 * enseguida y navega a `href`; `shown` es lo que hay que dibujar.
 */
export function usePeriodStep<T>(value: T, neighbors: string[]) {
  const router = useRouter();
  const [shown, setShown] = useOptimistic(value);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!pending) return;
    bump(1);
    return () => bump(-1);
  }, [pending]);
  const key = neighbors.join("|");
  useEffect(() => {
    for (const h of key.split("|")) if (h) router.prefetch(h);
  }, [key, router]);
  function go(next: T, href: string) {
    start(() => {
      setShown(next);
      router.push(href, { scroll: false });
    });
  }
  return { shown, go, pending };
}

/** La lista o los datos que dependen del período: se apagan un poco si tardan. */
export function NavDim({ children, className }: { children: React.ReactNode; className?: string }) {
  const pending = useNavPending();
  return (
    <div
      data-nav-pending={pending || undefined}
      className={cx(
        "transition-opacity duration-150 ease-[var(--ease-out)] data-[nav-pending]:opacity-55 data-[nav-pending]:delay-150",
        className,
      )}
    >
      {children}
    </div>
  );
}

const STEP_EVENT = "sb:paso-periodo";

/** Para el navegador de períodos: escucha los deslizamientos de la pantalla (−1 o +1). */
export function useStepEvents(onStep: (delta: 1 | -1) => void) {
  useEffect(() => {
    const h = (e: Event) => onStep((e as CustomEvent<1 | -1>).detail);
    window.addEventListener(STEP_EVENT, h);
    return () => window.removeEventListener(STEP_EVENT, h);
  });
}

/**
 * Props táctiles para el contenedor de la pantalla: deslizar a la izquierda va al
 * período siguiente; a la derecha, al anterior. Los gráficos (`data-no-swipe` o
 * svg grandes), las filas con scroll horizontal y las filas que se deslizan no cuentan.
 */
export function usePeriodSwipe(disabled?: boolean) {
  const send = (d: 1 | -1) => window.dispatchEvent(new CustomEvent(STEP_EVENT, { detail: d }));
  return useSwipe({ onLeft: () => send(1), onRight: () => send(-1), disabled });
}

/** `<main>` que cambia de período al deslizar (para pantallas de servidor, como el calendario del Journal). */
export function PeriodSwipeMain({ className, children }: { className?: string; children: React.ReactNode }) {
  const swipe = usePeriodSwipe();
  return (
    <main {...swipe} className={className}>
      {children}
    </main>
  );
}
