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
      <header className="sticky top-0 z-20 bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-2 px-4 lg:h-20 lg:px-8">
          <MenuButton />
          <h1 className="display truncate text-[26px] font-semibold lg:text-[30px]">{title}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-6 lg:px-8">
        <div role="alert" className="grid justify-items-start gap-3 card p-6 lg:p-8">
          <span className="inline-flex size-11 items-center justify-center rounded-[14px] bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]">
            <WarningCircle size={22} weight="bold" aria-hidden />
          </span>
          <h2 className="display text-xl font-semibold">No se pudo cargar esta pantalla</h2>
          <p className="max-w-[48ch] text-sm leading-relaxed text-muted">
            Puede ser la conexión o la base de datos. Lo que ya guardaste no se pierde. Probá de nuevo en un momento.
          </p>
          {error.digest && <p className="font-mono text-xs text-muted">Código: {error.digest}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => retry()}
              className="btn-glow inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent transition-[filter,transform] duration-300 ease-spring hover:brightness-105 active:scale-[0.97]"
            >
              <ArrowClockwise size={16} weight="bold" aria-hidden /> Reintentar
            </button>
            <Link
              href={back.href}
              className="inline-flex h-11 items-center rounded-full border border-line-strong bg-surface/60 px-5 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              {back.label}
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
