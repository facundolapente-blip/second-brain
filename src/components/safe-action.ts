"use client";

import { useCallback, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { notifyError } from "./undo-toast";

/**
 * Llamar server actions sin que un error tumbe la pantalla. En React 19 un error
 * dentro de una transición (sin señal, servidor caído, sesión vencida) sube hasta
 * el error.tsx y reemplaza todo por "No se pudo cargar esta pantalla". Con esto,
 * el error queda en un aviso abajo y lo optimista vuelve solo a como estaba.
 * Las redirecciones de Next (redirect, notFound) siguen de largo.
 */
export function actionErrorText(e: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "Sin señal: no se guardó. Probá de nuevo cuando vuelva.";
  const m = e instanceof Error ? e.message : "";
  if (/sesi[oó]n|autoriz|unauthor/i.test(m)) return "Tu sesión venció: volvé a entrar para guardar.";
  if (/fetch|network|failed to/i.test(m)) return "No hubo conexión con el servidor: no se guardó. Probá de nuevo.";
  return "No se pudo guardar. Probá de nuevo.";
}

function handle(e: unknown) {
  unstable_rethrow(e);
  console.warn("La acción no se pudo completar:", e);
  notifyError(actionErrorText(e));
}

/** Como `useTransition`, pero si la acción falla avisa en vez de romper la pantalla. */
export function useSafeTransition(): [boolean, (fn: () => unknown, opts?: { onError?: () => void }) => void] {
  const [pending, start] = useTransition();
  const run = useCallback(
    (fn: () => unknown, opts?: { onError?: () => void }) =>
      start(async () => {
        try {
          await fn();
        } catch (e) {
          opts?.onError?.();
          handle(e);
        }
      }),
    [start],
  );
  return [pending, run];
}

/** Para `useActionState`: si la acción falla, avisa y deja el estado como estaba (el formulario no se pierde). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeForm<F extends (state: any, ...rest: any[]) => unknown>(fn: F): F {
  return (async (state: unknown, ...rest: unknown[]) => {
    try {
      return await fn(state, ...rest);
    } catch (e) {
      handle(e);
      return state;
    }
  }) as unknown as F;
}

/** Para llamadas sueltas (sin transición): `void quiet(saveX(...))`. */
export function quiet(p: Promise<unknown>) {
  p.catch(handle);
}
