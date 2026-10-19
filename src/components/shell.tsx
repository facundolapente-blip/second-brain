"use client";

import { PillSwitch } from "./pill-switch";
import { notifyInfo, UndoToast } from "./undo-toast";
import { ContextMenuHost } from "./context-menu";
import { PullToRefresh } from "./pull-refresh";
import { plainClick } from "./tab-nav";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bell, CalendarCheck, ChartLineUp, Compass, ClipboardText, ClockCounterClockwise, Database, House, List, Medal, Notebook, SignOut, Wallet, type Icon } from "@phosphor-icons/react";
import { signOut } from "@/lib/auth-client";
import { THEME_COLOR, THEME_COOKIE, THEMES, type Theme } from "@/lib/theme";
import { BrainMark, ICON_GRADIENT } from "@/lib/brand";
import { flushQueue, pendingCount } from "@/lib/offline-queue";
import { flushActions, pendingActions, subscribePending } from "@/lib/offline/registry";
import { cx } from "./ui";
import { useTick } from "./motion";

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
  { href: "/valores", label: "Valores", icon: Compass },
  { href: "/semana", label: "Revisión semanal", icon: ClipboardText },
  { href: "/resumen", label: "Resumen mes y año", icon: CalendarCheck },
  { href: "/analisis", label: "Análisis", icon: ChartLineUp },
  { href: "/historial", label: "Historial y papelera", icon: ClockCounterClockwise },
  { href: "/avisos", label: "Avisos", icon: Bell },
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

/**
 * Mientras carga la pantalla del enlace tocado, su puntito late (sin mover nada:
 * siempre ocupa su lugar). Si la pantalla llega enseguida, ni se ve.
 */
function NavHint({ color }: { color?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cx("ml-auto size-2 shrink-0 rounded-full", pending && "nav-pending", !color && !pending && "opacity-0")}
      style={{ background: color ?? "currentColor" }}
    />
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  // La marca pasa al enlace tocado enseguida, sin esperar a que llegue la pantalla.
  const [clicked, setClicked] = useState<string | null>(null);
  const [from, setFrom] = useState(pathname);
  if (from !== pathname) {
    setFrom(pathname);
    setClicked(null);
  }
  const isActive = (href: string, exact?: boolean) =>
    clicked ? clicked === href : exact ? pathname === href : pathname.startsWith(href);

  // La marca de lo elegido es una sola pieza que se desliza al enlace nuevo. Hasta medir
  // (al cargar), cada enlace pinta su propio fondo: así nunca se ve sin marca.
  const nav = useRef<HTMLElement>(null);
  const [mark, setMark] = useState<{ y: number; h: number; moved: boolean } | null>(null);
  const activeHref = MODULES.find((m) => isActive(m.href, m.href === "/"))?.href ?? TOOLS.find((t) => isActive(t.href))?.href ?? null;
  useLayoutEffect(() => {
    const box = nav.current;
    if (!box) return;
    const measure = (moved: boolean) => {
      const el = activeHref ? box.querySelector<HTMLElement>(`a[data-href="${activeHref}"]`) : null;
      if (!el || el.getClientRects().length === 0) return setMark(null);
      const y = el.offsetTop;
      const h = el.offsetHeight;
      setMark((m) => (m && m.y === y && m.h === h ? m : { y, h, moved: moved && m !== null }));
    };
    measure(true);
    // Si cambia el alto de algo (llega la letra, se agranda la pantalla), se acomoda sin deslizarse.
    const ro = new ResizeObserver(() => measure(false));
    ro.observe(box);
    return () => ro.disconnect();
  }, [activeHref]);
  const markReady = mark !== null;

  const linkCls = (active: boolean) =>
    cx(
      "press tap-tint relative z-[1] flex items-center gap-3 rounded-xl px-3 transition-colors duration-200",
      active ? "font-semibold text-side-on" : "text-side-fg hover:bg-side-on-bg hover:text-side-on",
      active && !markReady && "bg-side-on-bg",
    );
  return (
    <nav ref={nav} aria-label="Módulos" className="relative">
      {mark && (
        <span
          aria-hidden
          className={cx(
            "pointer-events-none absolute inset-x-0 top-0 rounded-xl bg-side-on-bg",
            mark.moved && "transition-[translate,height] duration-[var(--dur-state)] ease-[var(--ease-glide)] motion-reduce:transition-none",
          )}
          style={{ translate: `0 ${mark.y}px`, height: mark.h }}
        />
      )}
      <ul className="grid gap-1">
        {MODULES.map((m, i) => {
          const active = isActive(m.href, m.href === "/");
          const Ico = m.icon;
          return (
            <li key={m.href}>
              <Link
                href={m.href}
                data-href={m.href}
                onClick={(e) => {
                  if (plainClick(e)) setClicked(m.href);
                  onNavigate?.();
                }}
                aria-current={active ? "page" : undefined}
                className={cx("h-11 text-[15px]", linkCls(active))}
              >
                <span className="font-mono text-[11px] tabular opacity-60">{String(i).padStart(2, "0")}</span>
                <Ico size={18} weight={active ? "fill" : "regular"} aria-hidden />
                {m.label}
                <NavHint color={m.color} />
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 mb-1.5 px-3 font-mono text-[10.5px] tracking-[0.12em] text-side-fg uppercase">Herramientas</p>
      <ul className="grid gap-1">
        {TOOLS.map((t) => {
          const active = isActive(t.href);
          const Ico = t.icon;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                data-href={t.href}
                onClick={(e) => {
                  if (plainClick(e)) setClicked(t.href);
                  onNavigate?.();
                }}
                aria-current={active ? "page" : undefined}
                className={cx("h-10 text-[14px]", linkCls(active))}
              >
                <Ico size={17} weight={active ? "fill" : "regular"} aria-hidden />
                {t.label}
                <NavHint />
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
  const tick = useTick(busy ? 2 : armed ? 1 : 0);
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
        "press flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-[13.5px]",
        armed ? "bg-[var(--st-fail-bg)] font-medium text-[var(--st-fail-fg)]" : "text-side-fg hover:bg-side-on-bg hover:text-side-on",
      )}
    >
      <SignOut size={17} aria-hidden />
      <span key={tick.key} className={tick.className}>
        {busy ? "Saliendo…" : armed ? "Tocá de nuevo para salir" : "Cerrar sesión"}
      </span>
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

/**
 * Cajón del celular: se cierra deslizándolo hacia la izquierda. Sigue al dedo (el
 * fondo se aclara a la par) y al soltar se cierra si pasó un tercio o fue un tirón;
 * si no, vuelve. Solo con el dedo y si el gesto es más horizontal que vertical
 * (deslizar para arriba o abajo y tocar un enlace siguen igual).
 */
function useSwipeToClose(close: () => void) {
  const g = useRef<{ x: number; y: number; t: number; dx: number; on: boolean; id: number } | null>(null);
  // El panel es el que recibe el gesto; el fondo, el hermano de antes.
  const parts = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    return { el, bg: el.previousElementSibling as HTMLElement | null };
  };
  const clear = (...els: (HTMLElement | null)[]) => {
    for (const x of els) {
      if (!x) continue;
      x.style.translate = "";
      x.style.opacity = "";
      x.style.transition = "";
    }
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      g.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, on: false, id: e.pointerId };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = g.current;
      if (!s) return;
      const { el, bg } = parts(e);
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.on) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) {
          if (Math.abs(dy) > 10) g.current = null;
          return;
        }
        s.on = true;
        try {
          el.setPointerCapture(s.id);
        } catch {
          // El puntero ya no está (se levantó el dedo): sigue sin captura.
        }
      }
      // Hacia la izquierda sigue al dedo; hacia la derecha se resiste.
      s.dx = dx < 0 ? dx : Math.min(12, Math.sqrt(dx) * 1.5);
      el.style.transition = "none";
      el.style.translate = `${s.dx}px 0`;
      if (bg) {
        bg.style.transition = "none";
        bg.style.opacity = String(Math.max(0, 1 + Math.min(0, s.dx) / el.offsetWidth));
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = g.current;
      g.current = null;
      if (!s?.on) return;
      const { el, bg } = parts(e);
      const fast = -s.dx / Math.max(1, e.timeStamp - s.t) > 0.5;
      if (-s.dx > el.offsetWidth / 3 || (fast && s.dx < -24)) {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          // Con menos movimiento no vuelve hacia adentro: queda donde lo soltó el dedo y se funde.
          el.style.transition = "opacity 120ms ease-out";
          el.style.opacity = "0";
          if (bg) {
            bg.style.transition = "opacity 120ms ease-out";
            bg.style.opacity = "0";
          }
          close();
          setTimeout(() => {
            el.style.transition = "none";
            clear(bg);
            el.style.translate = "";
            el.style.opacity = "";
            requestAnimationFrame(() => (el.style.transition = ""));
          }, 160);
          return;
        }
        // Al sacar el estilo en línea, la transición de cierre sigue desde donde quedó.
        clear(el, bg);
        close();
      } else {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.style.transition = reduce ? "translate 120ms ease-out" : "translate 420ms var(--ease-spring)";
        el.style.translate = "";
        if (bg) {
          bg.style.transition = "opacity 220ms ease-out";
          bg.style.opacity = "";
        }
        setTimeout(() => clear(el, bg), 440);
      }
    },
    onPointerCancel: (e: React.PointerEvent) => {
      g.current = null;
      const { el, bg } = parts(e);
      clear(el, bg);
    },
  };
}

export function Shell({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  const [drawer, setDrawer] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const swipe = useSwipeToClose(() => setDrawer(false));
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
  // Safari de iPhone no aplica :active (el tinte de .tap-tint) si nadie escucha touchstart.
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);

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
      <PullToRefresh />
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
              drawer ? "duration-[var(--dur-sheet)] ease-[var(--ease-out)]" : "duration-[var(--dur-exit)] ease-[var(--ease-in)]",
              drawer ? "opacity-100" : "opacity-0",
            )}
          />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
            {...swipe}
            className={cx(
              // Entra con la curva de las hojas y se va más rápido; se cierra también deslizándolo
              // hacia la izquierda. Con menos movimiento, solo un fundido en su lugar.
              "absolute inset-y-0 left-0 flex w-[17.5rem] touch-pan-y flex-col gap-8 bg-side px-4 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-[translate,opacity] motion-reduce:translate-x-0 motion-reduce:duration-[120ms]",
              drawer ? "duration-[var(--dur-sheet)] ease-[var(--ease-sheet)]" : "duration-[var(--dur-exit)] ease-[var(--ease-in)] motion-reduce:opacity-0",
              drawer ? "translate-x-0" : "-translate-x-full",
            )}
          >
            {/* La sombra existe solo con el cajón abierto (cerrado asomaba en el borde
                izquierdo de todas las pantallas): entra y se va en fundido con el cajón. */}
            <span
              aria-hidden
              className={cx(
                "pointer-events-none absolute inset-0 shadow-[16px_0_48px_-24px_rgba(0,0,0,0.45)] transition-opacity",
                drawer ? "opacity-100 duration-[var(--dur-sheet)] ease-[var(--ease-out)]" : "opacity-0 duration-[var(--dur-exit)] ease-[var(--ease-in)]",
              )}
            />
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
