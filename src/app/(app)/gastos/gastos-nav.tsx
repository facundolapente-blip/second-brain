"use client";

import { usePathname } from "next/navigation";
import { Bank, ChartPieSlice, Receipt, SquaresFour, type Icon } from "@phosphor-icons/react";
import { BottomBar, TopTabs } from "@/components/module-nav";

type Tab = { href: string; label: string; icon?: Icon; mobile: boolean };

const TABS: Tab[] = [
  { href: "/gastos", label: "Movimientos", icon: Receipt, mobile: true },
  { href: "/gastos/cuentas", label: "Cuentas", icon: Bank, mobile: true },
  { href: "/gastos/categorias", label: "Categorías", icon: SquaresFour, mobile: true },
  { href: "/gastos/sin-clasificar", label: "Sin clasificar", mobile: false },
  { href: "/gastos/plantillas", label: "Plantillas", mobile: false },
  { href: "/gastos/informes", label: "Informes", icon: ChartPieSlice, mobile: true },
];

function isActive(pathname: string, href: string) {
  if (href === "/gastos") return pathname === "/gastos";
  return pathname.startsWith(href);
}

/** En el celular, Sin clasificar y Plantillas cuelgan de Movimientos. */
function mobileActive(pathname: string, href: string) {
  if (href === "/gastos") {
    return pathname === "/gastos" || pathname.startsWith("/gastos/sin-clasificar") || pathname.startsWith("/gastos/plantillas");
  }
  return pathname.startsWith(href);
}

/** Barra inferior en el celular, como en Hábitos. */
export function GastosNav() {
  const pathname = usePathname();
  return (
    <BottomBar
      id="gastos"
      items={TABS.filter((t) => t.mobile).map((t) => ({ ...t, active: mobileActive(pathname, t.href) }))}
    />
  );
}

/** Pestañas del módulo en pantalla grande, debajo del título. */
export function GastosTabs() {
  const pathname = usePathname();
  return <TopTabs id="gastos" items={TABS.map((t) => ({ ...t, active: isActive(pathname, t.href) }))} />;
}
