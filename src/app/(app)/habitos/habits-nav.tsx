"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListChecks, Medal, SquaresFour, type Icon } from "@phosphor-icons/react";
import { cx } from "@/components/ui";

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
  return (
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3">
          {TABS.map((t) => {
            const active = isActive(pathname, t.href);
            const Ico = t.icon;
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
export function HabitsTabs() {
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
                  "-mb-px border-b-2 px-3 pb-2.5 text-sm transition-colors",
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
