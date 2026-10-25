"use client";

import { NavAddButton } from "@/components/nav-add";
import { CalendarDots, Target, type Icon } from "@phosphor-icons/react";
import { BottomTab, TopTab, useTabPath } from "@/components/tab-nav";

const TABS: { href: string; label: string; icon: Icon }[] = [
  { href: "/plan", label: "Semana y tareas", icon: CalendarDots },
  { href: "/plan/objetivos", label: "Objetivos", icon: Target },
];

function isActive(pathname: string, href: string) {
  return href === "/plan" ? pathname === "/plan" : pathname.startsWith(href);
}

/** Barra inferior en el celular, como en los otros módulos. */
export function PlanNav() {
  const [pathname, pick] = useTabPath();
  return (
    <nav aria-label="Plan" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-3 items-start">
        {TABS.map((t, i) => {
          const link = <BottomTab key={t.href} href={t.href} label={t.label} icon={t.icon} active={isActive(pathname, t.href)} onClick={pick(t.href)} />;
          // El "+" va en el medio, entre las dos pestañas (como en el Journal).
          return i === 0 ? [link, <NavAddButton key="nuevo" label={pathname === "/plan/objetivos" ? "Nuevo objetivo" : pathname.startsWith("/plan/objetivos/") ? "Nuevo objetivo chico" : "Nuevo bloque"} />] : link;
        })}
      </div>
    </nav>
  );
}

/** Pestañas del módulo en pantalla grande, debajo del título. */
export function PlanTabs() {
  const [pathname, pick] = useTabPath();
  return (
    <div className="hidden gap-6 border-b border-line lg:flex">
      {TABS.map((t) => (
        <TopTab key={t.href} href={t.href} label={t.label} active={isActive(pathname, t.href)} onClick={pick(t.href)} />
      ))}
    </div>
  );
}
