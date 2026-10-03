"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { CalendarCheck, List, Medal, Notebook, Wallet, X, type Icon } from "@phosphor-icons/react";
import { cx } from "./ui";

type Module = { href: string; label: string; icon: Icon; code: string };

const MODULES: Module[] = [
  { href: "/habitos", label: "Hábitos", icon: Medal, code: "01" },
  { href: "/journal", label: "Journal", icon: Notebook, code: "02" },
  { href: "/gastos", label: "Gastos", icon: Wallet, code: "03" },
  { href: "/plan", label: "Plan semanal", icon: CalendarCheck, code: "04" },
];

const DrawerCtx = createContext<() => void>(() => {});

/** Botón de menú (las tres rayitas) que abre los módulos en el celular. */
export function MenuButton() {
  const open = useContext(DrawerCtx);
  return (
    <button
      onClick={open}
      aria-label="Abrir menú"
      className="-ml-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-fg hover:bg-surface-2 lg:hidden"
    >
      <List size={24} weight="bold" />
    </button>
  );
}

/** Código del módulo actual (01 a 04) para la cabecera, como el número de una unidad. */
export function ModuleCode() {
  const pathname = usePathname();
  const m = MODULES.find((x) => pathname.startsWith(x.href));
  if (!m) return null;
  return (
    <span aria-hidden className="tabular hidden self-start pt-1 text-[11px] font-medium text-accent-fg sm:inline">
      {m.code}/
    </span>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Módulos" className="grid border-y border-rule">
      {MODULES.map((m, i) => {
        const active = pathname.startsWith(m.href);
        const Ico = m.icon;
        return (
          <Link
            key={m.href}
            href={m.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cx(
              "group relative grid h-12 grid-cols-[2.25rem_1fr_auto] items-center pr-3 text-[15px] transition-colors",
              i > 0 && "border-t border-line",
              active ? "bg-ink font-semibold text-on-ink" : "text-fg hover:bg-surface-2",
            )}
          >
            <span
              className={cx(
                "tabular pl-3 text-[11px]",
                active ? "text-accent" : "text-faint group-hover:text-muted",
              )}
            >
              {m.code}
            </span>
            <span className="truncate">{m.label}</span>
            <Ico size={18} weight={active ? "fill" : "regular"} className={active ? "text-accent" : "text-muted"} />
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="grid gap-3 px-3">
      <div className="flex items-center gap-2.5">
        <span className="relative inline-flex size-8 items-center justify-center bg-ink text-[14px] font-extrabold text-on-ink">
          F
          <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2 bg-accent" />
        </span>
        <span className="display text-[17px] uppercase">Second Brain</span>
      </div>
    </div>
  );
}

const CLOCK_FMT = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Reloj de Montevideo, como la hora de un tablero. Se pinta recién en el cliente. */
function Clock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const p = Object.fromEntries(CLOCK_FMT.formatToParts(new Date()).map((x) => [x.type, x.value]));
      setNow(`${String(p.weekday).replace(".", "").toUpperCase()} ${p.day}.${p.month}  ${p.hour}:${p.minute}`);
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return (
    <div className="mt-auto grid gap-1 border-t border-rule px-3 pt-3">
      <span className="label-mono text-faint">Montevideo</span>
      <time className="tabular text-[15px] font-medium whitespace-pre text-fg" aria-live="off">
        {now ?? " "}
      </time>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <DrawerCtx.Provider value={() => setDrawer(true)}>
      <div className="lg:grid lg:grid-cols-[240px_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-rule bg-surface py-5 lg:flex">
          <Brand />
          <Nav />
          <Clock />
        </aside>

        {/* Cajón lateral del celular */}
        <div
          className={cx("fixed inset-0 z-40 lg:hidden", drawer ? "pointer-events-auto" : "pointer-events-none")}
          aria-hidden={!drawer}
          inert={!drawer}
        >
          <div
            onClick={() => setDrawer(false)}
            className={cx(
              "absolute inset-0 bg-[rgba(18,18,17,0.45)] transition-opacity duration-200",
              drawer ? "opacity-100" : "opacity-0",
            )}
          />
          <aside
            className={cx(
              "absolute inset-y-0 left-0 flex w-72 flex-col gap-6 border-r border-rule bg-surface pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-transform duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
              drawer ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Cerrar menú"
                className="inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
              >
                <X size={20} weight="bold" />
              </button>
            </div>
            <Nav onNavigate={() => setDrawer(false)} />
            <Clock />
          </aside>
        </div>

        <div className="min-w-0">{children}</div>
      </div>
    </DrawerCtx.Provider>
  );
}
