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
  { href: "/plan", label: "Plan semanal", icon: CalendarCheck, soon: true },
];

const DrawerCtx = createContext<() => void>(() => {});

/** Botón de menú (las tres rayitas) que abre los módulos en el celular. */
export function MenuButton() {
  const open = useContext(DrawerCtx);
  return (
    <button
      onClick={open}
      aria-label="Abrir menú"
      className="-ml-2 inline-flex size-10 items-center justify-center rounded-md text-accent lg:hidden"
    >
      <List size={24} weight="bold" />
    </button>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-0.5">
      {MODULES.map((m) => {
        const active = pathname.startsWith(m.href);
        const Ico = m.icon;
        if (m.soon) {
          return (
            <span
              key={m.href}
              className="flex h-9 items-center gap-3 rounded-md px-2.5 text-sm text-faint"
              aria-disabled
            >
              <Ico size={18} />
              {m.label}
              <span className="ml-auto text-[11px] text-faint">Pronto</span>
            </span>
          );
        }
        return (
          <Link
            key={m.href}
            href={m.href}
            onClick={onNavigate}
            className={cx(
              "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors",
              active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Ico size={18} weight={active ? "fill" : "regular"} />
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2.5">
      <span className="inline-flex size-7 items-center justify-center rounded-md bg-ink text-[13px] font-semibold text-on-ink">
        F
      </span>
      <span className="text-sm font-semibold tracking-tight">Second Brain</span>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);

  return (
    <DrawerCtx.Provider value={() => setDrawer(true)}>
      <div className="lg:grid lg:grid-cols-[232px_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line px-3 py-5 lg:flex">
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
              "absolute inset-0 bg-[rgba(20,20,18,0.32)] transition-opacity duration-300",
              drawer ? "opacity-100" : "opacity-0",
            )}
          />
          <aside
            className={cx(
              "absolute inset-y-0 left-0 flex w-72 flex-col gap-6 bg-surface px-3 py-5 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
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
