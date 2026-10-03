"use client";

import { usePathname } from "next/navigation";
import { CalendarBlank, ChartBar, Plus } from "@phosphor-icons/react";
import { Button, cx } from "@/components/ui";
import { BottomBar, BottomLink, ModuleTabs } from "@/components/module-nav";
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
    <BottomBar cols={3}>
      <BottomLink href="/journal/calendario" label="Calendario" icon={CalendarBlank} active={pathname === "/journal/calendario"} />
      <div className="flex items-start justify-center">
        <button
          type="button"
          onClick={() => write()}
          disabled={pending}
          aria-label="Escribir hoy"
          className="lift -mt-4 inline-flex size-[60px] items-center justify-center border border-rule bg-accent text-on-accent transition-[transform,box-shadow,opacity] duration-150 hover:-translate-y-px active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-70"
        >
          <Plus size={28} weight="bold" className={cx(pending && "motion-safe:animate-pulse")} />
        </button>
      </div>
      <BottomLink
        href="/journal/estadisticas"
        label="Estadísticas"
        icon={ChartBar}
        active={pathname === "/journal/estadisticas"}
      />
    </BottomBar>
  );
}

/** Pestañas del módulo en pantalla grande, debajo del título. */
export function JournalTabs() {
  const pathname = usePathname();
  return <ModuleTabs items={TABS.map((t) => ({ href: t.href, label: t.label, active: pathname === t.href }))} />;
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
