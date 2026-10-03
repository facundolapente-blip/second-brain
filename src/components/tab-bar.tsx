"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { Icon } from "@phosphor-icons/react";
import { cx } from "./ui";

export type TabItem = { href: string; label: string; icon: Icon; active: boolean };

const SPRING = { type: "spring", stiffness: 520, damping: 40 } as const;

/** Una pestaña de la barra inferior: ícono arriba, rótulo abajo, píldora de color si está activa. */
export function BottomTab({ href, label, icon: Ico, active, group }: TabItem & { group: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="group relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-full py-1.5"
    >
      {active && (
        <motion.span layoutId={`tab-${group}`} transition={SPRING} className="absolute inset-0 rounded-full bg-accent-soft" />
      )}
      <Ico
        size={24}
        weight={active ? "fill" : "regular"}
        className={cx(
          "relative transition-[color,transform] duration-200 group-active:scale-90",
          active ? "text-accent-fg" : "text-muted",
        )}
      />
      <span className={cx("relative text-[11px] leading-none", active ? "font-extrabold text-accent-fg" : "font-semibold text-muted")}>
        {label}
      </span>
    </Link>
  );
}

/**
 * Barra inferior del celular: flota sobre el contenido como una cápsula
 * esmerilada. `center` (opcional) mete un botón grande al medio.
 */
export function BottomBar({ tabs, group, center }: { tabs: TabItem[]; group: string; center?: React.ReactNode }) {
  const half = Math.ceil(tabs.length / 2);
  const left = center ? tabs.slice(0, half) : tabs;
  const right = center ? tabs.slice(half) : [];
  const cols = tabs.length + (center ? 1 : 0);
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <div
        className="frost lift mx-auto grid max-w-md items-center gap-1 rounded-full p-1.5 ring-1 ring-line"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {left.map((t) => (
          <BottomTab key={t.href} {...t} group={group} />
        ))}
        {center && <div className="flex justify-center">{center}</div>}
        {right.map((t) => (
          <BottomTab key={t.href} {...t} group={group} />
        ))}
      </div>
    </nav>
  );
}

/** Pestañas del módulo en pantalla grande: píldoras con indicador que se desliza. */
export function TopTabs({ tabs, group }: { tabs: { href: string; label: string; active: boolean }[]; group: string }) {
  return (
    <div className="hidden pb-3 lg:block">
      <div className="inline-flex gap-1 rounded-full bg-surface-3/70 p-1">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cx(
              "relative rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-colors",
              t.active ? "font-extrabold text-fg" : "font-semibold text-muted hover:text-fg",
            )}
          >
            {t.active && (
              <motion.span
                layoutId={`top-${group}`}
                transition={SPRING}
                className="absolute inset-0 rounded-full bg-raised shadow-[0_1px_3px_rgba(var(--shadow-tint),0.14)]"
              />
            )}
            <span className="relative">{t.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
