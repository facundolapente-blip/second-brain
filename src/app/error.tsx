"use client";

import { useEffect } from "react";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";

/**
 * Error fuera de los módulos: sobre todo el layout de (app), que valida la sesión
 * contra la base (si la base no responde, falla antes de que exista el menú).
 * Los error.tsx de cada módulo no lo atajan porque están adentro de ese layout.
 * Va sin Shell (no hay menú) pero con los estilos de la app.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto grid min-h-dvh max-w-[42rem] content-center justify-items-start gap-3 px-5">
      <div role="alert" className="grid justify-items-start gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-[8px] bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]">
          <WarningCircle size={22} weight="bold" aria-hidden />
        </span>
        <p className="kicker">Second Brain</p>
        <h1 className="display text-[34px]">No se pudo abrir la app</h1>
        <p className="max-w-[52ch] text-[15px] leading-relaxed text-muted">
          Puede ser la conexión o la base de datos. Lo que ya guardaste no se pierde. Probá de nuevo en un momento.
        </p>
        {error.digest && <p className="font-mono text-xs text-muted">Código: {error.digest}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-on-ink transition-opacity hover:opacity-85"
          >
            <ArrowClockwise size={16} weight="bold" aria-hidden /> Reintentar
          </button>
        </div>
      </div>
    </main>
  );
}
