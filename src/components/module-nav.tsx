"use client";

import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { cx } from "./ui";

/**
 * Navegación de cada módulo con el mismo lenguaje: barra inferior en el
 * celular (con una regla arriba y la marca naranja sobre la pestaña activa) y
 * pestañas en mayúsculas monoespaciadas en pantalla grande.
 */

export function BottomBar({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="mx-auto grid max-w-md items-stretch" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {children}
      </div>
    </nav>
  );
}

export function BottomLink({ href, label, icon: Ico, active }: { href: string; label: string; icon: Icon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative flex min-h-[60px] flex-col items-center justify-center gap-1 transition-colors",
        active ? "text-fg" : "text-muted hover:text-fg",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "absolute inset-x-3 top-0 h-[3px] transition-[background-color] duration-200",
          active ? "bg-accent" : "bg-transparent",
        )}
      />
      <Ico size={22} weight={active ? "fill" : "regular"} />
      <span className={cx("label-mono text-[10px] tracking-[0.06em]", active && "font-bold")}>{label}</span>
    </Link>
  );
}

export function ModuleTabs({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <div className="-mb-px hidden lg:flex">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cx(
            "label-mono relative flex h-11 items-center px-3 whitespace-nowrap transition-colors first:pl-0",
            t.active ? "font-bold text-fg" : "text-muted hover:text-fg",
          )}
        >
          {t.label}
          <span
            aria-hidden
            className={cx("absolute right-3 bottom-0 left-3 h-[3px] [:first-child>&]:left-0", t.active ? "bg-accent" : "bg-transparent")}
          />
        </Link>
      ))}
    </div>
  );
}
