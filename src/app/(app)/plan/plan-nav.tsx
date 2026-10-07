"use client";

import { NavAddButton } from "@/components/nav-add";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDots, Target, type Icon } from "@phosphor-icons/react";
import { cx } from "@/components/ui";

const TABS: { href: string; label: string; icon: Icon }[] = [
  { href: "/plan", label: "Semana y tareas", icon: CalendarDots },
  { href: "/plan/objetivos", label: "Objetivos", icon: Target },
];

function isActive(pathname: string, href: string) {
  return href === "/plan" ? pathname === "/plan" : pathname.startsWith(href);
}

/** Barra inferior en el celular, como en los otros módulos. */
export function PlanNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Plan" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-3 items-start">
        {TABS.map((t, i) => {
          const active = isActive(pathname, t.href);
          const Ico = t.icon;
          const link = (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-col items-center gap-1 pt-2.5 pb-2"
            >
              <span
                aria-hidden
                className={cx("absolute top-0 h-[2px] w-8 rounded-full transition-colors", active ? "bg-accent" : "bg-transparent")}
              />
              <Ico size={22} weight={active ? "fill" : "regular"} className={active ? "text-fg" : "text-muted"} />
              <span className={cx("text-[11.5px]", active ? "font-semibold text-fg" : "text-muted")}>{t.label}</span>
            </Link>
          );
          // El "+" va en el medio, entre las dos pestañas (como en el Journal).
          return i === 0 ? [link, <NavAddButton key="nuevo" label={pathname.startsWith("/plan/objetivos") ? "Nuevo resultado clave" : "Nuevo bloque"} />] : link;
        })}
      </div>
    </nav>
  );
}

/** Pestañas del módulo en pantalla grande, debajo del título. */
export function PlanTabs() {
  const pathname = usePathname();
  return (
    <div className="hidden gap-6 border-b border-line lg:flex">
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "-mb-px border-b-[1.5px] pb-3 text-[14px] transition-colors",
              active ? "border-fg font-medium text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
