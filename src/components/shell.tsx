"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { motion } from "motion/react";
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
      className="-ml-1.5 inline-flex size-11 items-center justify-center rounded-full text-fg transition-[background-color,transform] duration-300 ease-spring hover:bg-surface-2 active:scale-90 lg:hidden"
    >
      <List size={22} weight="bold" />
    </button>
  );
}

function Nav({ onNavigate, pillId }: { onNavigate?: () => void; pillId: string }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-1">
      {MODULES.map((m) => {
        const active = pathname.startsWith(m.href);
        const Ico = m.icon;
        if (m.soon) {
          return (
            <span
              key={m.href}
              className="flex h-11 items-center gap-3 rounded-[14px] px-3 text-sm text-faint"
              aria-disabled
            >
              <Ico size={20} />
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
            aria-current={active ? "page" : undefined}
            className={cx(
              "group relative flex h-11 items-center gap-3 rounded-[14px] px-3 text-[14.5px] transition-colors duration-200",
              active ? "font-semibold text-fg" : "text-muted hover:text-fg",
            )}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                aria-hidden
                className="absolute inset-0 rounded-[14px] bg-surface-3/80 shadow-[inset_0_1px_0_var(--edge),0_8px_20px_-12px_rgba(var(--shadow-tint),0.5)]"
              />
            )}
            <span
              className={cx(
                "relative inline-flex size-7 items-center justify-center rounded-[9px] transition-colors duration-200",
                active ? "bg-accent text-on-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]" : "group-hover:text-fg",
              )}
            >
              <Ico size={17} weight={active ? "fill" : "regular"} />
            </span>
            <span className="relative">{m.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Marca: cuadrado azul noche con la F en ámbar (igual al ícono de la app). */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      className="display inline-flex shrink-0 items-center justify-center rounded-[30%] bg-[radial-gradient(circle_at_30%_20%,#2a3249,#0b0d13_72%)] font-bold text-[#ffab4a] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_18px_-8px_rgba(var(--shadow-tint),0.6)]"
    >
      F
    </span>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <BrandMark />
      <span className="grid leading-tight">
        <span className="display text-[16px] font-semibold">Second Brain</span>
        <span className="text-[12px] text-muted">de Facu</span>
      </span>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);

  return (
    <DrawerCtx.Provider value={() => setDrawer(true)}>
      <div className="lg:grid lg:grid-cols-[264px_1fr]">
        <div className="sticky top-0 hidden h-dvh p-3 pr-0 lg:block">
          <aside className="glass flex h-full flex-col gap-8 rounded-[26px] px-3 py-5">
            <Brand />
            <Nav pillId="nav-desk" />
          </aside>
        </div>

        {/* Cajón lateral del celular */}
        <div
          className={cx("fixed inset-0 z-40 lg:hidden", drawer ? "pointer-events-auto" : "pointer-events-none")}
          aria-hidden={!drawer}
          inert={!drawer}
        >
          <div
            onClick={() => setDrawer(false)}
            className={cx(
              "absolute inset-0 bg-[rgba(6,8,14,0.45)] backdrop-blur-[3px] transition-opacity duration-300",
              drawer ? "opacity-100" : "opacity-0",
            )}
          />
          <aside
            className={cx(
              "glass absolute inset-y-2 left-2 flex w-[17.5rem] flex-col gap-8 rounded-[26px] px-3 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5 transition-[transform,opacity] duration-500 ease-spring",
              drawer ? "translate-x-0 opacity-100" : "-translate-x-[calc(100%+1rem)] opacity-0",
            )}
          >
            <Brand />
            <Nav pillId="nav-drawer" onNavigate={() => setDrawer(false)} />
          </aside>
        </div>

        <div className="min-w-0">{children}</div>
      </div>
    </DrawerCtx.Provider>
  );
}
