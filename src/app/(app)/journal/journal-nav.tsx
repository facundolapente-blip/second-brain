"use client";

import { usePathname } from "next/navigation";
import { CalendarBlank, ChartBar, PencilSimpleLine, Plus } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { BottomBar, TopTabs } from "@/components/module-nav";
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
    <BottomBar
      id="journal"
      items={[
        { href: "/journal/calendario", label: "Calendario", icon: CalendarBlank, active: pathname === "/journal/calendario" },
        { href: "/journal/estadisticas", label: "Estadísticas", icon: ChartBar, active: pathname === "/journal/estadisticas" },
      ]}
      center={
        <motion.button
          type="button"
          onClick={() => write()}
          disabled={pending}
          aria-label="Escribir hoy"
          whileTap={{ scale: 0.9 }}
          whileHover={{ y: -2 }}
          className="btn-glow -mt-7 inline-flex size-[62px] items-center justify-center rounded-[22px] bg-accent text-on-accent ring-[5px] ring-bg disabled:opacity-70"
        >
          <PencilSimpleLine size={26} weight="bold" className={cx(pending && "motion-safe:animate-pulse")} />
        </motion.button>
      }
    />
  );
}

/** Pestañas del módulo en pantalla grande, debajo del título. */
export function JournalTabs() {
  const pathname = usePathname();
  return <TopTabs id="journal" items={TABS.map((t) => ({ ...t, active: pathname === t.href }))} />;
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
