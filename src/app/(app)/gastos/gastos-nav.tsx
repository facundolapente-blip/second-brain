"use client";

import { useRouter } from "next/navigation";
import { Bank, CaretDown, ChartPieSlice, PiggyBank, Receipt, type Icon } from "@phosphor-icons/react";
import { Menu } from "@/components/menu";
import { NavAddButton } from "@/components/nav-add";
import { BottomTab, TopTab, useTabPath } from "@/components/tab-nav";
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
  { href: "/gastos/categorias", label: "Categorías", mobile: false },
  { href: "/gastos/sin-clasificar", label: "Sin clasificar", mobile: false },
  { href: "/gastos/plantillas", label: "Plantillas", mobile: false },
  { href: "/gastos/recurrentes", label: "Recurrentes", mobile: false },
];

function isActive(pathname: string, href: string) {
  if (href === "/gastos") return pathname === "/gastos";
  return pathname.startsWith(href);
}

/**
 * En el celular, Buscar, Categorías, Sin clasificar, Plantillas, Recurrentes y Deudas
 * cuelgan de Movimientos (menú "Más"); Metas, de Presupuestos; Proyección, de Informes.
 */
function mobileActive(pathname: string, href: string) {
  if (href === "/gastos/informes") return pathname.startsWith("/gastos/informes") || pathname.startsWith("/gastos/proyeccion");
  if (href === "/gastos/presupuestos") return pathname.startsWith("/gastos/presupuestos") || pathname.startsWith("/gastos/metas");
  if (href === "/gastos") {
    return (
      pathname === "/gastos" ||
      ["/gastos/buscar", "/gastos/categorias", "/gastos/sin-clasificar", "/gastos/plantillas", "/gastos/recurrentes", "/gastos/deudas"].some((p) =>
        pathname.startsWith(p),
      )
    );
  }
  return pathname.startsWith(href);
}

/**
 * Barra inferior en el celular: Movimientos, Cuentas, "+", Presupuestos, Informes.
 * El "+" abre la hoja de carga de la pantalla abierta (la pantalla escucha `useOnNew`);
 * si la pantalla no lo escucha, va a Movimientos con la hoja abierta (`?nuevo=1`).
 */
export function GastosNav() {
  const [path, pick] = useTabPath();
  const tabs = TABS.filter((t) => t.mobile);
  return (
    <nav aria-label="Gastos" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 items-start">
        {tabs.map((t, i) => {
          const tab = <BottomTab key={t.href} href={t.href} label={t.label} icon={t.icon!} active={mobileActive(path, t.href)} onClick={pick(t.href)} />;
          // El "+" va en el medio (como en Plan y Journal).
          return i === 1 ? [tab, <NavAddButton key="nuevo" label="Nuevo movimiento" fallbackHref="/gastos?nuevo=1" />] : tab;
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
  const [pathname, pick] = useTabPath();
  const router = useRouter();
  const extra = TABS.filter((t) => !t.mobile);
  const current = extra.find((t) => isActive(pathname, t.href));
  return (
    <div className="hidden items-end gap-6 border-b border-line lg:flex">
      {TABS.filter((t) => t.mobile).map((t) => (
        <TopTab key={t.href} href={t.href} label={t.label} active={isActive(pathname, t.href)} onClick={pick(t.href)} />
      ))}
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
