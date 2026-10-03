"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { CalendarCheck, CaretRight, List, Medal, Notebook, Wallet, type Icon } from "@phosphor-icons/react";
import { cx } from "./ui";

type Module = { href: string; label: string; icon: Icon; mod: string; hint: string; soon?: boolean };

const MODULES: Module[] = [
  { href: "/habitos", label: "Hábitos", icon: Medal, mod: "mod-habitos", hint: "Rachas y marcas" },
  { href: "/journal", label: "Journal", icon: Notebook, mod: "mod-journal", hint: "Tu diario" },
  { href: "/gastos", label: "Gastos", icon: Wallet, mod: "mod-gastos", hint: "Cuentas y movimientos" },
  { href: "/plan", label: "Plan semanal", icon: CalendarCheck, mod: "mod-plan", hint: "Semana y objetivos" },
];

const DrawerCtx = createContext<() => void>(() => {});

/**
 * Marca de la app: cuatro cuadraditos redondeados, uno por pilar, en el color
 * de cada módulo (coral, violeta, verde, azul).
 */
export function BrandMark({ size = 28 }: { size?: number }) {
  const gap = Math.max(2, Math.round(size / 14));
  const cell = (size - gap) / 2;
  return (
    <span aria-hidden className="inline-grid shrink-0 grid-cols-2" style={{ width: size, height: size, gap }}>
      {["mod-habitos", "mod-journal", "mod-gastos", "mod-plan"].map((m) => (
        <span key={m} className={cx(m, "bg-accent")} style={{ width: cell, height: cell, borderRadius: cell * 0.36 }} />
      ))}
    </span>
  );
}

/** Botón de menú (las tres rayitas) que abre los módulos en el celular. */
export function MenuButton() {
  const open = useContext(DrawerCtx);
  return (
    <button
      onClick={open}
      aria-label="Abrir menú"
      className="relative -ml-1.5 inline-flex size-10 items-center justify-center rounded-full bg-surface text-fg shadow-[0_1px_3px_rgba(var(--shadow-tint),0.1)] transition-transform active:scale-90 lg:hidden"
    >
      <List size={20} weight="bold" />
    </button>
  );
}

function Nav({ onNavigate, big }: { onNavigate?: () => void; big?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-1.5" aria-label="Módulos">
      {MODULES.map((m) => {
        const active = pathname.startsWith(m.href);
        const Ico = m.icon;
        return (
          <Link
            key={m.href}
            href={m.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cx(
              m.mod,
              "group relative flex items-center gap-3 rounded-[18px] p-2 transition-colors",
              active ? "bg-surface shadow-[0_1px_3px_rgba(var(--shadow-tint),0.08)]" : "hover:bg-surface/60",
            )}
          >
            <span
              className={cx(
                "inline-flex shrink-0 items-center justify-center bg-accent text-on-accent transition-transform duration-300 ease-[cubic-bezier(0.2,1.4,0.4,1)] group-hover:scale-105 group-active:scale-95",
                big ? "size-11 rounded-[18px]" : "size-9 rounded-[11px]",
              )}
            >
              <Ico size={big ? 24 : 20} weight="fill" />
            </span>
            <span className="grid min-w-0 leading-tight">
              <span className={cx("truncate", big ? "text-[17px]" : "text-[15px]", active ? "font-extrabold" : "font-bold")}>
                {m.label}
              </span>
              {big && <span className="truncate text-[13px] font-semibold text-muted">{m.hint}</span>}
            </span>
            {big && <CaretRight size={16} weight="bold" className="ml-auto text-faint" />}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <BrandMark />
      <span className="text-[17px] font-black tracking-tight">Second Brain</span>
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
    // Las animaciones de Motion respetan "reducir movimiento" del sistema.
    <MotionConfig reducedMotion="user">
      <DrawerCtx.Provider value={() => setDrawer(true)}>
        <div className="lg:grid lg:grid-cols-[256px_1fr]">
          <aside className="sticky top-0 hidden h-dvh flex-col gap-7 px-4 py-6 lg:flex">
            <Brand />
            <Nav />
          </aside>

          {/* Cajón del celular: hoja que entra desde la izquierda con resorte. */}
          <AnimatePresence>
            {drawer && (
              <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Módulos">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => setDrawer(false)}
                  className="absolute inset-0 bg-[var(--backdrop)]"
                />
                <motion.aside
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ type: "spring", stiffness: 420, damping: 40 }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={{ left: 0.6, right: 0 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -60 || info.velocity.x < -400) setDrawer(false);
                  }}
                  className="absolute inset-y-0 left-0 flex w-[84%] max-w-80 flex-col gap-7 rounded-r-[28px] bg-bg px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6"
                >
                  <Brand />
                  <Nav big onNavigate={() => setDrawer(false)} />
                </motion.aside>
              </div>
            )}
          </AnimatePresence>

          <div className="min-w-0">{children}</div>
        </div>
      </DrawerCtx.Provider>
    </MotionConfig>
  );
}
