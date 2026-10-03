"use client";

import { usePathname } from "next/navigation";
import { ListChecks, Medal, SquaresFour, type Icon } from "@phosphor-icons/react";
import { BottomBar, TopTabs } from "@/components/module-nav";

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
  const pathname = usePathname();
  return <BottomBar id="habitos" items={TABS.map((t) => ({ ...t, active: isActive(pathname, t.href) }))} />;
}

/** Pestañas del módulo en pantalla grande, debajo del título. */
export function HabitsTabs() {
  const pathname = usePathname();
  return <TopTabs id="habitos" items={TABS.map((t) => ({ ...t, active: isActive(pathname, t.href) }))} />;
}
