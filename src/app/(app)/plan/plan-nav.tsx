"use client";

import { usePathname } from "next/navigation";
import { CalendarDots, CheckSquareOffset, Target, type Icon } from "@phosphor-icons/react";
import { BottomBar, TopTabs } from "@/components/tab-bar";

const TABS: { href: string; label: string; icon: Icon }[] = [
  { href: "/plan", label: "Semana", icon: CalendarDots },
  { href: "/plan/tareas", label: "Tareas", icon: CheckSquareOffset },
  { href: "/plan/objetivos", label: "Objetivos", icon: Target },
];

function isActive(pathname: string, href: string) {
  return href === "/plan" ? pathname === "/plan" : pathname.startsWith(href);
}

/** Barra inferior en el celular, como en los otros módulos. */
export function PlanNav() {
  const pathname = usePathname();
  return <BottomBar group="plan" tabs={TABS.map((t) => ({ ...t, active: isActive(pathname, t.href) }))} />;
}

/** Pestañas del módulo en pantalla grande, debajo del título. */
export function PlanTabs() {
  const pathname = usePathname();
  return <TopTabs group="plan" tabs={TABS.map((t) => ({ ...t, active: isActive(pathname, t.href) }))} />;
}
