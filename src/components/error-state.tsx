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
      <header className="sticky top-0 z-20 bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-2 px-4 lg:min-h-24 lg:items-end lg:px-10 lg:pb-4">
          <MenuButton />
          <h1 className="display pb-0.5 text-[28px] lg:text-[40px]">{title}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-6 lg:px-10">
        <div role="alert" className="grid justify-items-start gap-3 border-y border-line py-8">
          <span className="inline-flex size-10 items-center justify-center rounded-[8px] bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]">
            <WarningCircle size={22} weight="bold" aria-hidden />
          </span>
          <h2 className="display text-[26px]">No se pudo cargar esta pantalla</h2>
          <p className="max-w-[52ch] text-[15px] leading-relaxed text-muted">
            Puede ser la conexión o la base de datos. Lo que ya guardaste no se pierde. Probá de nuevo en un momento.
          </p>
          {error.digest && <p className="font-mono text-xs text-muted">Código: {error.digest}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-on-ink transition-opacity hover:opacity-85 active:scale-[0.98]"
            >
              <ArrowClockwise size={16} weight="bold" aria-hidden /> Reintentar
            </button>
            <Link
              href={back.href}
              className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              {back.label}
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
