"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bank, ChartPieSlice, Receipt, SquaresFour, type Icon } from "@phosphor-icons/react";
import { cx } from "@/components/ui";

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
  const tabs = TABS.filter((t) => t.mobile);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4">
        {tabs.map((t) => {
          const active = mobileActive(pathname, t.href);
          const Ico = t.icon!;
          return (
            <Link key={t.href} href={t.href} className="flex flex-col items-center gap-1 pt-2 pb-2.5">
              <span
                className={cx(
                  "flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200",
                  active ? "bg-accent-soft text-accent-fg" : "text-muted",
                )}
              >
                <Ico size={22} weight={active ? "fill" : "regular"} />
              </span>
              <span className={cx("text-[12px]", active ? "font-semibold text-fg" : "text-muted")}>{t.label}</span>
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
    <div className="hidden gap-1 border-b border-line lg:flex">
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cx(
              "-mb-px border-b-2 px-3 pb-2.5 text-sm whitespace-nowrap transition-colors",
              active ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
