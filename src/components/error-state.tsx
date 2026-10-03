"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import { MenuButton } from "./shell";

/**
 * Pantalla de error de un módulo (la usan los error.tsx). Dice qué pasó en
 * castellano, ofrece reintentar y una salida; el detalle técnico va a la consola.
 */
export function ErrorState({
  title,
  error,
  retry,
  back,
}: {
  title: string;
  error: Error & { digest?: string };
  retry: () => void;
  back: { href: string; label: string };
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-rule bg-bg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4 lg:h-[72px] lg:px-8">
          <MenuButton />
          <h1 className="display text-[24px] uppercase lg:text-[34px]">{title}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-6 lg:px-8">
        <div role="alert" className="grid justify-items-start gap-3 border border-rule border-l-4 border-l-danger bg-surface p-6 lg:p-8">
          <span className="label-mono inline-flex items-center gap-1.5 text-danger">
            <WarningCircle size={16} weight="bold" aria-hidden /> Error de carga
          </span>
          <h2 className="text-xl font-bold tracking-tight">No se pudo cargar esta pantalla</h2>
          <p className="max-w-[48ch] text-sm leading-relaxed text-muted">
            Puede ser la conexión o la base de datos. Lo que ya guardaste no se pierde. Probá de nuevo en un momento.
          </p>
          {error.digest && <p className="font-mono text-xs text-muted">Código: {error.digest}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => retry()}
              className="label-mono inline-flex h-11 items-center gap-2 rounded-md border border-rule bg-accent px-4 text-on-accent shadow-[2px_2px_0_var(--rule)] transition-shadow hover:shadow-[1px_1px_0_var(--rule)] active:translate-y-px active:shadow-none"
            >
              <ArrowClockwise size={16} weight="bold" aria-hidden /> Reintentar
            </button>
            <Link
              href={back.href}
              className="label-mono inline-flex h-11 items-center rounded-md border border-rule px-4 transition-colors hover:bg-surface-2"
            >
              {back.label}
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
