"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { CalendarBlank, ChartBar, PenNib, Plus, type Icon } from "@phosphor-icons/react";
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
 * Direcciones del journal recorridas en esta pestaña, en orden (con búsqueda y
 * filtros). Vive en memoria: al recargar se vacía, así que nunca apunta a algo
 * fuera de la app. (No se vacía al desmontar: React lo desmonta y monta de nuevo
 * en algunas navegaciones dentro del módulo.)
 */
let trail: string[] = [];

/** Anota cada dirección del journal (va en el layout del módulo). */
export function JournalTrail() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const url = search ? `${pathname}?${search}` : pathname;
  useEffect(() => {
    if (trail.at(-1) !== url) trail.push(url);
    if (trail.length > 50) trail = trail.slice(-50);
  }, [url]);
  return null;
}

type NavigationLike = { currentEntry?: { index: number } | null; entries?: () => { url: string | null }[] };

/** Una pantalla del journal que no es el editor (lista, calendario, estadísticas). */
function isJournalList(u: string) {
  const path = u.split("?")[0];
  return (path === "/journal" || path.startsWith("/journal/")) && !isEditor(path);
}

/**
 * Adónde vuelve la flecha del editor: si la pantalla anterior de esta pestaña es
 * una del journal, Atrás (conserva búsqueda, filtros, ?ver=, ?n= y la posición);
 * si no (abierto directo, o desde Inicio), la última lista vista o /journal.
 */
export function journalReturn(): { back: true } | { back: false; href: string } {
  let prev = trail.length > 1 && !isJournalList(trail.at(-1)!) ? trail.at(-2) : undefined;
  // Con la Navigation API se sabe exacta la entrada anterior del historial (también si se pasó por otro módulo).
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  if (nav?.currentEntry && typeof nav.entries === "function") {
    const i = nav.currentEntry.index;
    const raw = i > 0 ? nav.entries()[i - 1]?.url : null;
    const u = raw ? new URL(raw) : null;
    prev = u && u.origin === location.origin ? u.pathname + u.search : undefined;
  }
  if (prev && isJournalList(prev)) return { back: true };
  return { back: false, href: trail.findLast(isJournalList) ?? "/journal" };
}

function SideLink({ href, label, icon: Ico, active }: { href: string; label: string; icon: Icon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="relative flex flex-col items-center gap-1 pt-2.5 pb-2"
    >
      <span
        aria-hidden
        className={cx("absolute top-0 h-[2px] w-8 rounded-full transition-colors", active ? "bg-accent" : "bg-transparent")}
      />
      <Ico size={22} weight={active ? "fill" : "regular"} className={active ? "text-fg" : "text-muted"} />
      <span className={cx("text-[11.5px]", active ? "font-semibold text-fg" : "text-muted")}>{label}</span>
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
    <nav aria-label="Journal" className="page-fade fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-3 items-start">
        <SideLink href="/journal/calendario" label="Calendario" icon={CalendarBlank} active={pathname === "/journal/calendario"} />
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => write()}
            disabled={pending}
            aria-label="Escribir hoy"
            className="lift -mt-5 inline-flex size-[58px] items-center justify-center rounded-full bg-ink text-on-ink ring-[5px] ring-bg transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 active:scale-95 disabled:opacity-70 motion-reduce:transition-none"
          >
            <PenNib size={26} className={cx(pending && "motion-safe:animate-pulse")} />
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
    <div className="hidden gap-6 border-b border-line lg:flex">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "-mb-px border-b-[1.5px] pb-3 text-[14px] transition-colors",
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

/** Botón de escribir en la cabecera (solo pantalla grande; en el celular está la barra). */
export function WriteTodayButton({ wroteToday }: { wroteToday?: boolean }) {
  const { pending, write } = useWrite();
  return (
    <Button variant="accent" size="sm" className="max-lg:hidden" disabled={pending} onClick={() => write()}>
      <Plus size={16} weight="bold" /> {wroteToday ? "Seguir hoy" : "Escribir hoy"}
    </Button>
  );
}
