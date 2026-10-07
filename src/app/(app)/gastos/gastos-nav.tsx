"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bank, CaretDown, ChartPieSlice, PiggyBank, Receipt, SquaresFour, type Icon } from "@phosphor-icons/react";
import { Menu } from "@/components/menu";
import { cx } from "@/components/ui";

type Tab = { href: string; label: string; icon?: Icon; mobile: boolean };

const TABS: Tab[] = [
  { href: "/gastos", label: "Movimientos", icon: Receipt, mobile: true },
  { href: "/gastos/buscar", label: "Buscar", mobile: false },
  { href: "/gastos/cuentas", label: "Cuentas", icon: Bank, mobile: true },
  { href: "/gastos/presupuestos", label: "Presupuestos", icon: PiggyBank, mobile: true },
  { href: "/gastos/metas", label: "Metas", mobile: false },
  { href: "/gastos/deudas", label: "Deudas", mobile: false },
  { href: "/gastos/informes", label: "Informes", icon: ChartPieSlice, mobile: true },
  { href: "/gastos/proyeccion", label: "Proyección", mobile: false },
  { href: "/gastos/categorias", label: "Categorías", icon: SquaresFour, mobile: true },
  { href: "/gastos/sin-clasificar", label: "Sin clasificar", mobile: false },
  { href: "/gastos/plantillas", label: "Plantillas", mobile: false },
  { href: "/gastos/recurrentes", label: "Recurrentes", mobile: false },
];

function isActive(pathname: string, href: string) {
  if (href === "/gastos") return pathname === "/gastos";
  return pathname.startsWith(href);
}

/**
 * En el celular, Historial, Sin clasificar, Plantillas, Recurrentes y Deudas
 * cuelgan de Movimientos; Metas, de Presupuestos; Proyección, de Informes.
 */
function mobileActive(pathname: string, href: string) {
  if (href === "/gastos/informes") return pathname.startsWith("/gastos/informes") || pathname.startsWith("/gastos/proyeccion");
  if (href === "/gastos/presupuestos") return pathname.startsWith("/gastos/presupuestos") || pathname.startsWith("/gastos/metas");
  if (href === "/gastos") {
    return (
      pathname === "/gastos" ||
      ["/gastos/buscar", "/gastos/sin-clasificar", "/gastos/plantillas", "/gastos/recurrentes", "/gastos/deudas"].some((p) =>
        pathname.startsWith(p),
      )
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

/**
 * Pestañas del módulo en pantalla grande, debajo del título: las mismas cinco
 * del celular y el resto en "Más" (que toma el nombre de la pantalla abierta).
 */
export function GastosTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const extra = TABS.filter((t) => !t.mobile);
  const current = extra.find((t) => isActive(pathname, t.href));
  return (
    <div className="hidden items-end gap-6 border-b border-line lg:flex">
      {TABS.filter((t) => t.mobile).map((t) => {
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
      <Menu
        align="left"
        trigger={(toggle) => (
          <button
            type="button"
            onClick={toggle}
            aria-current={current ? "page" : undefined}
            className={cx(
              "-mb-px inline-flex items-center gap-1 border-b-[1.5px] pb-3 text-[14px] whitespace-nowrap transition-colors",
              current ? "border-fg font-medium text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {current ? current.label : "Más"}
            <CaretDown size={12} weight="bold" aria-hidden />
          </button>
        )}
        items={extra.map((t) => ({ label: t.label, onSelect: () => router.push(t.href) }))}
      />
    </div>
  );
}
