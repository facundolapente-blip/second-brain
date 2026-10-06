"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { CalendarCheck, List, Medal, Notebook, Wallet, type Icon } from "@phosphor-icons/react";
import { cx } from "./ui";

type Module = { href: string; label: string; icon: Icon; soon?: boolean };

const MODULES: Module[] = [
  { href: "/habitos", label: "Hábitos", icon: Medal },
  { href: "/journal", label: "Journal", icon: Notebook },
  { href: "/gastos", label: "Gastos", icon: Wallet },
  { href: "/plan", label: "Plan semanal", icon: CalendarCheck },
];

const DrawerCtx = createContext<() => void>(() => {});

/** Botón de menú (las tres rayitas) que abre los módulos en el celular. */
export function MenuButton() {
  const open = useContext(DrawerCtx);
  return (
    <button
      onClick={open}
      aria-label="Abrir menú"
      className="-ml-2.5 inline-flex size-11 items-center justify-center rounded-[4px] text-fg transition-colors hover:bg-surface-2 lg:hidden"
    >
      <List size={22} />
    </button>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Módulos">
      <p className="kicker px-3 pb-3">Índice</p>
      <ul className="border-t border-line">
        {MODULES.map((m, i) => {
          const active = pathname.startsWith(m.href);
          const Ico = m.icon;
          const num = String(i + 1).padStart(2, "0");
          if (m.soon) {
            return (
              <li key={m.href} className="border-b border-line">
                <span className="flex h-12 items-center gap-3 px-3 text-[15px] text-faint" aria-disabled>
                  <span className="font-mono text-[11px]">{num}</span>
                  {m.label}
                  <span className="kicker ml-auto">Pronto</span>
                </span>
              </li>
            );
          }
          return (
            <li key={m.href} className="border-b border-line">
              <Link
                href={m.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "group relative flex h-12 items-center gap-3 px-3 text-[15px] transition-colors",
                  active ? "text-fg" : "text-muted hover:text-fg",
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "absolute inset-y-3 left-0 w-[2px] rounded-full transition-colors",
                    active ? "bg-accent" : "bg-transparent",
                  )}
                />
                <span className={cx("font-mono text-[11px] tabular", active ? "text-accent-fg" : "text-faint")}>
                  {num}
                </span>
                <span className={cx(active && "font-semibold")}>{m.label}</span>
                <Ico
                  size={17}
                  weight={active ? "fill" : "regular"}
                  className={cx("ml-auto transition-opacity", active ? "opacity-100" : "opacity-0 group-hover:opacity-60")}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Brand() {
  return (
    <div className="grid gap-1 px-3">
      <span className="display text-[26px] italic">Second Brain</span>
      <span className="kicker">Cuaderno de Facu</span>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);

  return (
    <DrawerCtx.Provider value={() => setDrawer(true)}>
      <div className="lg:grid lg:grid-cols-[248px_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col gap-10 border-r border-line px-4 pt-8 pb-6 lg:flex">
          <Brand />
          <Nav />
        </aside>

        {/* Cajón lateral del celular */}
        <div
          className={cx("fixed inset-0 z-40 lg:hidden", drawer ? "pointer-events-auto" : "pointer-events-none")}
          aria-hidden={!drawer}
        >
          <div
            onClick={() => setDrawer(false)}
            className={cx(
              "absolute inset-0 bg-[rgba(30,26,20,0.34)] transition-opacity duration-300 motion-reduce:transition-none",
              drawer ? "opacity-100" : "opacity-0",
            )}
          />
          <aside
            className={cx(
              "absolute inset-y-0 left-0 flex w-[17.5rem] flex-col gap-10 border-r border-line-strong bg-bg px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-6 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
              drawer ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <Brand />
            <Nav onNavigate={() => setDrawer(false)} />
          </aside>
        </div>

        <div className="min-w-0">{children}</div>
      </div>
    </DrawerCtx.Provider>
  );
}
