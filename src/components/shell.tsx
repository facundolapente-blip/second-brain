"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { CalendarCheck, House, List, Medal, Notebook, Wallet, type Icon } from "@phosphor-icons/react";
import { THEME_COOKIE, THEMES, type Theme } from "@/lib/theme";
import { cx } from "./ui";

type Module = { href: string; label: string; icon: Icon; color: string };

const MODULES: Module[] = [
  { href: "/", label: "Inicio", icon: House, color: "var(--mod-inicio)" },
  { href: "/habitos", label: "Hábitos", icon: Medal, color: "var(--mod-habitos)" },
  { href: "/journal", label: "Journal", icon: Notebook, color: "var(--mod-journal)" },
  { href: "/gastos", label: "Gastos", icon: Wallet, color: "var(--mod-gastos)" },
  { href: "/plan", label: "Plan semanal", icon: CalendarCheck, color: "var(--mod-plan)" },
];

const DrawerCtx = createContext<() => void>(() => {});

/** Botón de menú (las tres rayitas) que abre los módulos en el celular. */
export function MenuButton() {
  const open = useContext(DrawerCtx);
  return (
    <button
      onClick={open}
      aria-label="Abrir menú"
      className="-ml-2.5 inline-flex size-11 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-2 lg:hidden"
    >
      <List size={22} />
    </button>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Módulos">
      <ul className="grid gap-1">
        {MODULES.map((m, i) => {
          const active = m.href === "/" ? pathname === "/" : pathname.startsWith(m.href);
          const Ico = m.icon;
          return (
            <li key={m.href}>
              <Link
                href={m.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors duration-200",
                  active ? "bg-side-on-bg font-semibold text-side-on" : "text-side-fg hover:bg-side-on-bg hover:text-side-on",
                )}
              >
                <span className="font-mono text-[11px] tabular opacity-60">{String(i).padStart(2, "0")}</span>
                <Ico size={18} weight={active ? "fill" : "regular"} aria-hidden />
                {m.label}
                <span aria-hidden className="ml-auto size-2 rounded-full" style={{ background: m.color }} />
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
    <div className="flex items-center gap-3 px-3">
      <span className="inline-flex size-8 items-center justify-center rounded-[10px] bg-[var(--mod-habitos)] text-[14px] font-semibold text-white">
        F
      </span>
      <span className="text-[16px] font-semibold tracking-tight text-side-on">Second Brain</span>
    </div>
  );
}

/** Aplica el tema en la página y lo recuerda un año (la cookie la lee el servidor). */
function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** Elegir el tema: se guarda en una cookie (la lee el servidor) y se aplica al instante. */
function ThemePicker({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  function pick(t: Theme) {
    setTheme(t);
    applyTheme(t);
  }
  return (
    <div className="grid gap-2 px-1">
      <span className="px-2 font-mono text-[10.5px] tracking-[0.12em] text-side-fg uppercase">Tema</span>
      <div role="radiogroup" aria-label="Tema" className="grid grid-cols-2 gap-1 rounded-full bg-side-on-bg p-1">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={theme === t.id}
            onClick={() => pick(t.id)}
            className={cx(
              "h-8 rounded-full text-[12px] font-medium transition-colors duration-200",
              theme === t.id ? "bg-side-on text-side" : "text-side-fg hover:text-side-on",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Al volver a la app (el celular la deja abierta en segundo plano), si pasó un
 * rato o cambió el día, se piden los datos de nuevo: así no queda mostrando
 * "hoy" de ayer ni lo que se marcó desde otro dispositivo.
 */
function useRefreshOnReturn() {
  const router = useRouter();
  useEffect(() => {
    let hiddenAt = 0;
    const onChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const day = (t: number) => new Date(t).toDateString();
      if (hiddenAt && (Date.now() - hiddenAt > 5 * 60_000 || day(hiddenAt) !== day(Date.now()))) router.refresh();
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [router]);
}

export function Shell({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  const [drawer, setDrawer] = useState(false);
  useRefreshOnReturn();

  return (
    <DrawerCtx.Provider value={() => setDrawer(true)}>
      <div className="lg:grid lg:grid-cols-[256px_1fr]">
        <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-side-line bg-side px-4 pt-7 pb-5 lg:flex">
          <Brand />
          <Nav />
          <div className="mt-auto">
            <ThemePicker initial={theme} />
          </div>
        </aside>

        {/* Cajón lateral del celular */}
        <div
          className={cx("fixed inset-0 z-40 lg:hidden", drawer ? "pointer-events-auto" : "pointer-events-none")}
          aria-hidden={!drawer}
        >
          <div
            onClick={() => setDrawer(false)}
            className={cx(
              "absolute inset-0 bg-[rgba(20,18,14,0.45)] transition-opacity duration-300 motion-reduce:transition-none",
              drawer ? "opacity-100" : "opacity-0",
            )}
          />
          <aside
            className={cx(
              "absolute inset-y-0 left-0 flex w-[17.5rem] flex-col gap-8 bg-side px-4 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
              drawer ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <Brand />
            <Nav onNavigate={() => setDrawer(false)} />
            <div className="mt-auto">
              <ThemePicker initial={theme} />
            </div>
          </aside>
        </div>

        <div className="min-w-0">{children}</div>
      </div>
    </DrawerCtx.Provider>
  );
}
