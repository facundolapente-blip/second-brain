"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { Icon } from "@phosphor-icons/react";
import { cx } from "./ui";

export type NavItem = { href: string; label: string; icon?: Icon; active: boolean };

/**
 * Barra inferior del celular: una isla de vidrio que flota sobre el contenido.
 * La pastilla del elegido se desliza entre pestañas con un resorte.
 */
export function BottomBar({ id, items, center }: { id: string; items: NavItem[]; center?: React.ReactNode }) {
  const half = Math.ceil(items.length / 2);
  const render = (t: NavItem) => {
    const Ico = t.icon!;
    return (
      <Link
        key={t.href}
        href={t.href}
        aria-current={t.active ? "page" : undefined}
        className="relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[20px] px-1"
      >
        {t.active && (
          <motion.span
            layoutId={`bar-${id}`}
            aria-hidden
            className="absolute inset-0 rounded-[20px] bg-surface-3/70 shadow-[inset_0_1px_0_var(--edge)]"
          />
        )}
        <Ico
          size={22}
          weight={t.active ? "fill" : "regular"}
          className={cx("relative transition-colors duration-200", t.active ? "text-accent-fg" : "text-muted")}
        />
        <span
          className={cx(
            "relative text-[11.5px] leading-tight transition-colors duration-200",
            t.active ? "font-semibold text-fg" : "text-muted",
          )}
        >
          {t.label}
        </span>
      </Link>
    );
  };
  const cols = items.length + (center ? 1 : 0);
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-3 bottom-[max(0.625rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-md lg:hidden"
    >
      <div
        className="glass grid items-center gap-1 rounded-[26px] p-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {center ? (
          <>
            {items.slice(0, half).map(render)}
            <div className="flex justify-center">{center}</div>
            {items.slice(half).map(render)}
          </>
        ) : (
          items.map(render)
        )}
      </div>
    </nav>
  );
}

/** Pestañas del módulo en pantalla grande, debajo del título: pastillas con indicador que se desliza. */
export function TopTabs({ id, items }: { id: string; items: NavItem[] }) {
  return (
    <div className="hidden pb-3 lg:flex">
      <div className="flex gap-0.5 rounded-full border border-line bg-surface/50 p-1 shadow-[inset_0_1px_0_var(--edge)]">
        {items.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cx(
              "relative rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors duration-200",
              t.active ? "font-medium text-fg" : "text-muted hover:text-fg",
            )}
          >
            {t.active && (
              <motion.span
                layoutId={`tabs-${id}`}
                aria-hidden
                className="absolute inset-0 rounded-full bg-surface-3 shadow-[inset_0_1px_0_var(--edge),0_4px_12px_-6px_rgba(var(--shadow-tint),0.45)]"
              />
            )}
            <span className="relative">{t.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
