"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarBlank, ChartBar, Plus, type Icon } from "@phosphor-icons/react";
import { Button, cx } from "@/components/ui";
import { useWrite } from "./journal-ui";

const TABS = [
  { href: "/journal", label: "Entradas" },
  { href: "/journal/calendario", label: "Calendario" },
  { href: "/journal/estadisticas", label: "Estadísticas" },
];

/** El editor ocupa toda la pantalla: sin barra inferior. */
function isEditor(pathname: string) {
  return pathname.startsWith("/journal/") && !TABS.some((t) => t.href === pathname);
}

function SideLink({ href, label, icon: Ico, active }: { href: string; label: string; icon: Icon; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className="flex flex-col items-center gap-1 pt-2 pb-2.5">
      <span
        className={cx(
          "flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200",
          active ? "bg-accent-soft text-accent-fg" : "text-muted",
        )}
      >
        <Ico size={22} weight={active ? "fill" : "regular"} />
      </span>
      <span className={cx("text-[12px]", active ? "font-semibold text-fg" : "text-muted")}>{label}</span>
    </Link>
  );
}

/**
 * Barra inferior del celular, como en la app de diario que usaba Facu:
 * calendario a la izquierda, el botón grande de escribir al medio y
 * estadísticas a la derecha.
 */
export function JournalNav() {
  const pathname = usePathname();
  const { pending, write } = useWrite();
  if (isEditor(pathname)) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-3 items-start">
        <SideLink href="/journal/calendario" label="Calendario" icon={CalendarBlank} active={pathname === "/journal/calendario"} />
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => write()}
            disabled={pending}
            aria-label="Escribir hoy"
            className="lift -mt-5 inline-flex size-[60px] items-center justify-center rounded-[20px] bg-accent text-on-accent ring-4 ring-bg transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 active:scale-95 disabled:opacity-70"
          >
            <Plus size={28} weight="bold" className={cx(pending && "animate-pulse")} />
          </button>
        </div>
        <SideLink
          href="/journal/estadisticas"
          label="Estadísticas"
          icon={ChartBar}
          active={pathname === "/journal/estadisticas"}
        />
      </div>
    </nav>
  );
}

/** Pestañas del módulo en pantalla grande, debajo del título. */
export function JournalTabs() {
  const pathname = usePathname();
  return (
    <div className="hidden gap-1 border-b border-line lg:flex">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
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

/** Botón de escribir en la cabecera (solo pantalla grande; en el celular está la barra). */
export function WriteTodayButton({ wroteToday }: { wroteToday?: boolean }) {
  const { pending, write } = useWrite();
  return (
    <Button variant="accent" size="sm" className="max-lg:hidden" disabled={pending} onClick={() => write()}>
      <Plus size={16} weight="bold" /> {wroteToday ? "Seguir hoy" : "Escribir hoy"}
    </Button>
  );
}
