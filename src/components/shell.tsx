"use client";

import { PillSwitch } from "./pill-switch";
import { notifyInfo, UndoToast } from "./undo-toast";
import { ContextMenuHost } from "./context-menu";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { CalendarCheck, ChartLineUp, ClipboardText, ClockCounterClockwise, Database, House, List, Medal, Notebook, SignOut, Wallet, type Icon } from "@phosphor-icons/react";
import { signOut } from "@/lib/auth-client";
import { THEME_COLOR, THEME_COOKIE, THEMES, type Theme } from "@/lib/theme";
import { BrainMark, ICON_GRADIENT } from "@/lib/brand";
import { flushQueue, pendingCount } from "@/lib/offline-queue";
import { flushActions, pendingActions, subscribePending } from "@/lib/offline/registry";
import { cx } from "./ui";

type Module = { href: string; label: string; icon: Icon; color: string };

const MODULES: Module[] = [
  { href: "/", label: "Inicio", icon: House, color: "var(--mod-inicio)" },
  { href: "/habitos", label: "Hábitos", icon: Medal, color: "var(--mod-habitos)" },
  { href: "/journal", label: "Journal", icon: Notebook, color: "var(--mod-journal)" },
  { href: "/gastos", label: "Gastos", icon: Wallet, color: "var(--mod-gastos)" },
  { href: "/plan", label: "Plan semanal", icon: CalendarCheck, color: "var(--mod-plan)" },
];

/** Herramientas que cruzan los módulos. */
const TOOLS: { href: string; label: string; icon: Icon }[] = [
  { href: "/semana", label: "Revisión semanal", icon: ClipboardText },
  { href: "/resumen", label: "Resumen mes y año", icon: CalendarCheck },
  { href: "/analisis", label: "Análisis", icon: ChartLineUp },
  { href: "/historial", label: "Historial y papelera", icon: ClockCounterClockwise },
  { href: "/datos", label: "Datos", icon: Database },
];

const DrawerCtx = createContext<() => void>(() => {});

/** Botón de menú (las tres rayitas) que abre los módulos en el celular. */
export function MenuButton() {
  const open = useContext(DrawerCtx);
  return (
    <button
      onClick={open}
      aria-label="Abrir menú"
      className="-ml-2.5 inline-flex size-11 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-2 lg:hidden print:hidden"
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
      <p className="mt-6 mb-1.5 px-3 font-mono text-[10.5px] tracking-[0.12em] text-side-fg uppercase">Herramientas</p>
      <ul className="grid gap-1">
        {TOOLS.map((t) => {
          const active = pathname.startsWith(t.href);
          const Ico = t.icon;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors duration-200",
                  active ? "bg-side-on-bg font-semibold text-side-on" : "text-side-fg hover:bg-side-on-bg hover:text-side-on",
                )}
              >
                <Ico size={17} weight={active ? "fill" : "regular"} aria-hidden />
                {t.label}
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
      <span
        className="inline-flex size-8 items-center justify-center rounded-[10px] text-white"
        style={{ backgroundImage: ICON_GRADIENT }}
      >
        <BrainMark size={19} />
      </span>
      <span className="text-[16px] font-semibold tracking-tight text-side-on">Second Brain</span>
    </div>
  );
}

/** Aplica el tema en la página y lo recuerda un año (la cookie la lee el servidor). */
function applyTheme(t: Theme) {
  document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  const set = () => {
    document.documentElement.dataset.theme = t;
    // La barra de estado del celular cambia con el tema (la etiqueta la puso el layout raíz).
    for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      m.content = THEME_COLOR[t];
      m.removeAttribute("media");
    }
  };
  // Claro y oscuro se cruzan en un fundido donde el navegador lo permite (si no, cambia directo).
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition) doc.startViewTransition(set);
  else set();
}

/** Elegir el tema: se guarda en una cookie (la lee el servidor) y se aplica al instante. */
/**
 * Cerrar sesión (abajo del menú). Pide un segundo toque para no salir sin querer
 * y borra todo lo guardado en el aparato (tiene tus datos): colas sin subir
 * (antes intenta subirlas), cachés del service worker y el service worker mismo.
 */
function SignOutButton() {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  async function out() {
    setBusy(true);
    // Con señal, lo pendiente se sube antes de salir (después se borra del aparato).
    if (navigator.onLine) {
      try {
        await flushQueue();
        await flushActions();
      } catch {
        // Lo que no se pudo subir se pierde al salir: es lo mismo que pasaría sin señal.
      }
    }
    try {
      await signOut();
    } catch {
      // Sin señal: igual se borra lo guardado y se va al login.
    }
    // Todo lo que quedó en el aparato tiene datos: colas sin subir, pantallas y
    // fotos guardadas para usar sin señal y el service worker.
    for (const store of [localStorage, sessionStorage]) {
      try {
        for (const k of Object.keys(store)) if (k.startsWith("sb_")) store.removeItem(k);
      } catch {
        // Almacenamiento bloqueado: nada que borrar.
      }
    }
    try {
      for (const k of await caches.keys()) await caches.delete(k);
    } catch {
      // Navegador sin caché: nada que borrar.
    }
    try {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    } catch {
      // Sin service worker (en la compu de desarrollo no se registra).
    }
    // Carga completa (no navegación del cliente): así no queda nada en memoria
    // (las colas guardan una copia) y el service worker se vuelve a registrar al entrar.
    window.location.replace("/login");
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => (armed ? out() : setArmed(true))}
      aria-live="polite"
      className={cx(
        "flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-[13.5px] transition-colors",
        armed ? "bg-[var(--st-fail-bg)] font-medium text-[var(--st-fail-fg)]" : "text-side-fg hover:bg-side-on-bg hover:text-side-on",
      )}
    >
      <SignOut size={17} aria-hidden />
      {busy ? "Saliendo…" : armed ? "Tocá de nuevo para salir" : "Cerrar sesión"}
    </button>
  );
}

function ThemePicker({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  function pick(t: Theme) {
    setTheme(t);
    applyTheme(t);
  }
  return (
    <div className="grid gap-2 px-1">
      <span className="px-2 font-mono text-[10.5px] tracking-[0.12em] text-side-fg uppercase">Tema</span>
      <PillSwitch
        label="Tema"
        value={theme}
        options={THEMES.map((t) => ({ value: t.id, label: t.label }))}
        onChange={pick}
        className="grid w-full"
        track="bg-side-on-bg"
        thumb="bg-side-on"
        on="text-side"
        off="text-side-fg hover:text-side-on"
        item="h-8 text-[12px]"
      />
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

/**
 * Sin señal: registra el service worker (solo en producción), avisa cuando no
 * hay conexión y, al volver, manda lo que quedó en este aparato (las marcas de
 * Hábitos y la cola general de `lib/offline/queue.ts`), en orden. Reintenta cada
 * 30 s mientras quede algo (la señal a veces "vuelve" antes de andar de verdad).
 */
function useOffline() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const count = () => setPending(pendingCount() + pendingActions().length);
    let busy = false;
    const update = async () => {
      setOffline(!navigator.onLine);
      count();
      if (busy || !navigator.onLine || pendingCount() + pendingActions().length === 0) return;
      busy = true;
      setSyncing(true);
      try {
        const sent = (await flushQueue()) + (await flushActions());
        if (sent > 0) {
          router.refresh();
          notifyInfo(sent === 1 ? "Se subió 1 cambio hecho sin conexión." : `Se subieron ${sent} cambios hechos sin conexión.`);
        }
      } finally {
        busy = false;
        setSyncing(false);
        count();
      }
    };
    update();
    const unsub = subscribePending(count);
    const timer = setInterval(update, 30_000);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      unsub();
      clearInterval(timer);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [router]);
  return { offline, pending, syncing };
}

export function Shell({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  const [drawer, setDrawer] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  // Cajón abierto: Escape lo cierra, el foco entra al menú y al cerrar vuelve a
  // donde estaba (el botón "Abrir menú").
  useEffect(() => {
    if (!drawer) return;
    const opener = document.activeElement as HTMLElement | null;
    drawerRef.current?.querySelector<HTMLElement>("a[href], button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setDrawer(false);
      // Abierto es modal: Tab y Shift+Tab dan la vuelta dentro del cajón.
      if (e.key !== "Tab" || !drawerRef.current) return;
      const items = [...drawerRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(
        (el) => el.getClientRects().length > 0,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = drawerRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [drawer]);
  useRefreshOnReturn();
  const { offline, pending, syncing } = useOffline();

  return (
    <DrawerCtx.Provider value={() => setDrawer(true)}>
      <a
        href="#contenido"
        className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-[14px] font-medium text-on-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      <UndoToast />
      <ContextMenuHost />
      <div className="lg:grid lg:grid-cols-[256px_1fr] print:block">
        <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-side-line bg-side px-4 pt-7 pb-5 lg:flex print:hidden">
          <Brand />
          <Nav />
          <div className="mt-auto grid gap-3">
            <ThemePicker initial={theme} />
            <SignOutButton />
          </div>
        </aside>

        {/* Cajón lateral del celular */}
        <div
          className={cx("fixed inset-0 z-40 lg:hidden print:hidden", drawer ? "pointer-events-auto" : "pointer-events-none")}
          // Cerrado no se ve ni se alcanza con Tab.
          inert={!drawer}
        >
          <div
            onClick={() => setDrawer(false)}
            className={cx(
              "absolute inset-0 bg-[rgba(20,18,14,0.45)] transition-opacity",
              drawer ? "duration-[280ms] ease-[var(--ease-out)]" : "duration-200 ease-[var(--ease-in)]",
              drawer ? "opacity-100" : "opacity-0",
            )}
          />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
            className={cx(
              // Entra en 280 ms y se va en 200 (más rápido); con menos movimiento, solo un fundido en su lugar.
              "absolute inset-y-0 left-0 flex w-[17.5rem] flex-col gap-8 bg-side px-4 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-[translate,opacity] motion-reduce:translate-x-0 motion-reduce:duration-[120ms]",
              drawer ? "duration-[280ms] ease-[var(--ease-out)]" : "duration-200 ease-[var(--ease-in)] motion-reduce:opacity-0",
              drawer ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <Brand />
            <Nav onNavigate={() => setDrawer(false)} />
            <div className="mt-auto grid gap-3">
              <ThemePicker initial={theme} />
              <SignOutButton />
            </div>
          </aside>
        </div>

        <div id="contenido" tabIndex={-1} className="min-w-0 outline-none">
          {/* Aviso de arriba: se despliega y se pliega (no empuja la pantalla de golpe). */}
          <div className="fold sticky top-0 z-40 print:hidden" data-closed={!(offline || pending > 0) || undefined}>
            <div>
            <p role="status" className="bg-[var(--st-skip-bg)] px-4 py-2 text-center text-[13px] text-[var(--st-skip-fg)]">
              {offline
                ? `Sin conexión: lo que hagas se guarda en este aparato y se sube cuando vuelva la señal.${pending ? ` ${pending === 1 ? "1 cambio pendiente" : `${pending} cambios pendientes`}.` : ""}`
                : syncing
                  ? `Subiendo ${pending === 1 ? "1 cambio" : `${pending} cambios`} hechos sin conexión…`
                  : `${pending === 1 ? "1 cambio hecho sin conexión" : `${pending} cambios hechos sin conexión`} todavía sin subir. Se reintenta solo.`}
            </p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </DrawerCtx.Provider>
  );
}
