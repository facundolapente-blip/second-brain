"use client";

import { NavAddButton } from "@/components/nav-add";
import { ListChecks, Medal, SquaresFour, type Icon } from "@phosphor-icons/react";
import { BottomTab, TopTab, useTabPath } from "@/components/tab-nav";

const TABS: { href: string; label: string; icon: Icon }[] = [
  { href: "/habitos", label: "Hoy", icon: ListChecks },
  { href: "/habitos/lista", label: "Hábitos", icon: Medal },
  { href: "/habitos/categorias", label: "Categorías", icon: SquaresFour },
];

function isActive(pathname: string, href: string) {
  if (href === "/habitos") return pathname === "/habitos";
  if (href === "/habitos/categorias") return pathname.startsWith(href);
  // Archivados y el detalle de un hábito cuelgan de la pestaña Hábitos.
  return pathname !== "/habitos" && !pathname.startsWith("/habitos/categorias");
}

/** Barra inferior en el celular, como en HabitNow. */
export function HabitsNav() {
  const [pathname, pick] = useTabPath();
  return (
      <nav aria-label="Hábitos" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 items-start">
          {TABS.map((t) => (
            <BottomTab key={t.href} href={t.href} label={t.label} icon={t.icon} active={isActive(pathname, t.href)} onClick={pick(t.href)} />
          ))}
          <NavAddButton label={pathname.startsWith("/habitos/categorias") ? "Nueva categoría" : "Nuevo hábito"} />
        </div>
      </nav>
  );
}

/** Pestañas del módulo en pantalla grande, debajo del título. */
export function HabitsTabs() {
  const [pathname, pick] = useTabPath();
  return (
        <div className="hidden gap-6 border-b border-line lg:flex">
          {TABS.map((t) => (
            <TopTab key={t.href} href={t.href} label={t.label} active={isActive(pathname, t.href)} onClick={pick(t.href)} />
          ))}
        </div>
  );
}
