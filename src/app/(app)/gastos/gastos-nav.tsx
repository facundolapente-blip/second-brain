"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bank, ChartPieSlice, PiggyBank, Receipt, SquaresFour, type Icon } from "@phosphor-icons/react";
import { cx } from "@/components/ui";

type Tab = { href: string; label: string; icon?: Icon; mobile: boolean };

const TABS: Tab[] = [
  { href: "/gastos", label: "Movimientos", icon: Receipt, mobile: true },
  { href: "/gastos/cuentas", label: "Cuentas", icon: Bank, mobile: true },
  { href: "/gastos/categorias", label: "Categorías", icon: SquaresFour, mobile: true },
  { href: "/gastos/sin-clasificar", label: "Sin clasificar", mobile: false },
  { href: "/gastos/plantillas", label: "Plantillas", mobile: false },
  { href: "/gastos/recurrentes", label: "Recurrentes", mobile: false },
  { href: "/gastos/presupuestos", label: "Presupuestos", icon: PiggyBank, mobile: true },
  { href: "/gastos/informes", label: "Informes", icon: ChartPieSlice, mobile: true },
  { href: "/gastos/proyeccion", label: "Proyección", mobile: false },
];

function isActive(pathname: string, href: string) {
  if (href === "/gastos") return pathname === "/gastos";
  return pathname.startsWith(href);
}

/** En el celular, Sin clasificar, Plantillas y Recurrentes cuelgan de Movimientos; Proyección, de Informes. */
function mobileActive(pathname: string, href: string) {
  if (href === "/gastos/informes") return pathname.startsWith("/gastos/informes") || pathname.startsWith("/gastos/proyeccion");
  if (href === "/gastos") {
    return (
      pathname === "/gastos" ||
      pathname.startsWith("/gastos/sin-clasificar") ||
      pathname.startsWith("/gastos/plantillas") ||
      pathname.startsWith("/gastos/recurrentes")
    );
  }
  return pathname.startsWith(href);
}

/** Barra inferior en el celular, como en Hábitos. */
export function GastosNav() {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => t.mobile);
  return (
    <nav aria-label="Gastos" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map((t) => {
          const active = mobileActive(pathname, t.href);
          const Ico = t.icon!;
          return (
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
        })}
      </div>
    </nav>
  );
}

/** Pestañas del módulo en pantalla grande, debajo del título. */
export function GastosTabs() {
  const pathname = usePathname();
  return (
    <div className="hidden gap-6 overflow-x-auto border-b border-line [scrollbar-width:none] lg:flex [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "-mb-px border-b-[1.5px] pb-3 text-[14px] whitespace-nowrap transition-colors",
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
