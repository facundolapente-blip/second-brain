"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { notifyDeleted } from "./undo-toast";
import { haptic } from "./haptics";
import { useTick } from "./motion";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "ghost" | "outline" | "danger";
  size?: "sm" | "md";
};

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[background-color,border-color,color,transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none motion-reduce:active:scale-100",
        size === "md" ? "h-11 px-5 text-[14px]" : "h-9 px-3.5 text-[13px]",
        variant === "primary" && "bg-ink text-on-ink hover:opacity-85",
        // En Papel la acción principal se escribe con tinta: "accent" queda como alias de primary.
        variant === "accent" && "bg-ink text-on-ink hover:opacity-85",
        variant === "ghost" && "text-fg hover:bg-surface-2",
        variant === "outline" && "border border-line-strong bg-transparent text-fg hover:border-fg/40 hover:bg-surface-2",
        variant === "danger" && "text-danger hover:bg-[var(--st-fail-bg)]",
        className,
      )}
    />
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...props}
      className={cx(
        // El área táctil se agranda 4px por lado sin cambiar el tamaño visible (44px con size-9).
        !/\b(absolute|fixed|sticky)\b/.test(className ?? "") && "relative",
        "inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-surface-2 hover:text-fg active:scale-95 motion-reduce:active:scale-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("grid gap-1.5", className)}>
      <span className="kicker">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-[4px] border border-line-strong bg-surface px-3 text-[15px] text-fg placeholder:text-faint outline-none transition-colors focus:border-fg/50 focus:ring-2 focus:ring-[var(--focus)]";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, spellCheck, ...props }, ref) {
    // Corrector del navegador en español (subrayado rojo y sugerencias con clic derecho) en
    // todo campo de texto; no en números, montos, fechas ni horas.
    const textual = (!props.type || props.type === "text" || props.type === "search") && props.inputMode !== "numeric" && props.inputMode !== "decimal";
    return <input ref={ref} lang="es" spellCheck={spellCheck ?? (textual || undefined)} {...props} className={cx(inputClass, className)} />;
  },
);

/** Grupo de opciones excluyentes con aspecto de interruptor segmentado. */
/**
 * Teclado de un grupo de radios (Segmented, PillSwitch): flechas izquierda/derecha
 * (y arriba/abajo), Inicio y Fin. Devuelve a qué opción pasar, o null si no es una de esas teclas.
 */
export function radioKeyTarget(e: React.KeyboardEvent, index: number, count: number): number | null {
  if (e.altKey || e.ctrlKey || e.metaKey || count < 2) return null;
  let to: number;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") to = (index + 1) % count;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = (index - 1 + count) % count;
  else if (e.key === "Home") to = 0;
  else if (e.key === "End") to = count - 1;
  else return null;
  e.preventDefault();
  return to;
}

export function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name?: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      className="relative grid auto-cols-fr grid-flow-col rounded-[5px] border border-line bg-surface-2 p-[3px]"
      role="radiogroup"
      onKeyDown={(e) => {
        const to = radioKeyTarget(e, index, options.length);
        if (to === null) return;
        haptic("select");
        onChange(options[to].value);
        e.currentTarget.querySelectorAll<HTMLElement>("[role=radio]")[to]?.focus();
      }}
    >
      {/* La marca de lo elegido se desliza a la opción nueva (las columnas son iguales). */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-[3px] left-[3px] rounded-[3px] bg-raised shadow-[0_1px_2px_rgba(var(--shadow-tint),0.12)] transition-transform duration-[var(--dur-state)] ease-[var(--ease-glide)] motion-reduce:transition-none"
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          // Como un grupo de radios nativo: Tab entra solo a lo elegido y las flechas cambian.
          tabIndex={o.value === options[index]?.value ? 0 : -1}
          onClick={() => {
            if (o.value !== value) haptic("select");
            onChange(o.value);
          }}
          className={cx(
            "relative h-9 rounded-[3px] px-2 text-[13px] font-medium transition-colors duration-[var(--dur-state)]",
            value === o.value ? "text-fg" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}

export type SheetHandle = { open: () => void; close: () => void };

/** Lo que dura la salida de una hoja (igual que `--dur-exit` en globals.css). */
const EXIT_MS = 180;

/**
 * Hoja inferior en el celular, modal centrado en pantalla grande. Usa <dialog>
 * nativo: foco atrapado, Escape y fondo gratis. En el celular se cierra también
 * arrastrando la agarradera hacia abajo; la salida es más rápida que la entrada.
 */
export const Sheet = forwardRef<
  SheetHandle,
  {
    title: string;
    children: React.ReactNode;
    onClose?: () => void;
    defaultOpen?: boolean;
    /** Más ancha en pantalla grande (formularios largos). */
    wide?: boolean;
    /** Al cerrarla la persona (afuera, X, Escape, arrastrar), antes de cerrar: p. ej. guardar. No corre con `close()` del handle. */
    onDismiss?: () => void;
  }
>(function Sheet({ title, children, onClose, defaultOpen, wide, onDismiss }, ref) {
  const dlg = useRef<HTMLDialogElement>(null);
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
  const drag = useRef<{ y: number; t: number; dy: number; past: boolean } | null>(null);
  // Dónde empezó el clic: seleccionar texto arrastrando y soltar afuera también
  // da un "click" en el fondo, y eso cerraba la hoja.
  const downOnBackdrop = useRef(false);

  function reset(d: HTMLDialogElement) {
    d.classList.remove("closing");
    d.style.transform = "";
    d.style.transition = "";
    d.style.removeProperty("--sheet-fade");
  }
  function open() {
    const d = dlg.current;
    if (!d) return;
    clearTimeout(closing.current);
    reset(d);
    if (!d.open) d.showModal();
  }
  /** Cierra con la animación de salida (con menos movimiento, un fundido corto). */
  function close() {
    const d = dlg.current;
    if (!d?.open || d.classList.contains("closing")) return;
    d.classList.add("closing");
    closing.current = setTimeout(() => {
      d.close();
      reset(d);
    }, EXIT_MS);
  }
  /** Cierre pedido por la persona: primero `onDismiss` (si la hoja sigue abierta). */
  function dismiss() {
    const d = dlg.current;
    if (!d?.open || d.classList.contains("closing")) return;
    onDismiss?.();
    close();
  }
  useImperativeHandle(ref, () => ({ open, close }));
  useEffect(() => {
    if (defaultOpen) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultOpen]);
  useEffect(() => () => clearTimeout(closing.current), []);

  /** Cuánto hay que bajarla (o un tirón) para que se cierre al soltar. */
  const DISMISS_PX = 90;
  function dragStart(y: number, t: number) {
    drag.current = { y, t, dy: 0, past: false };
    dlg.current?.classList.add("dragging");
  }
  function dragMove(y: number) {
    const g = drag.current;
    const d = dlg.current;
    if (!g || !d) return;
    const raw = y - g.y;
    // Hacia abajo sigue al dedo; hacia arriba se resiste (cede poco y cada vez menos).
    g.dy = Math.max(0, raw);
    const shown = raw >= 0 ? raw : -Math.min(14, Math.sqrt(-raw) * 1.6);
    d.style.transition = "none";
    d.style.transform = `translateY(${shown}px)`;
    // El fondo se aclara a medida que la hoja baja.
    d.style.setProperty("--sheet-fade", String(Math.max(0.15, 1 - g.dy / Math.max(1, d.offsetHeight))));
    const past = g.dy > DISMISS_PX;
    if (past && !g.past) haptic("threshold");
    g.past = past;
  }
  function dragEnd(t: number) {
    const g = drag.current;
    const d = dlg.current;
    drag.current = null;
    if (!g || !d) return;
    d.classList.remove("dragging");
    const fast = g.dy / Math.max(1, t - g.t) > 0.6;
    if (g.dy > DISMISS_PX || (fast && g.dy > 24)) {
      haptic("tap");
      onDismiss?.();
      // Sigue bajando a la velocidad que traía (un tirón rápido se va más rápido).
      d.style.transition = `transform ${fast ? 150 : EXIT_MS}ms var(--ease-in)`;
      d.style.transform = "translateY(100%)";
      d.classList.add("closing-drag");
      clearTimeout(closing.current);
      closing.current = setTimeout(() => {
        d.close();
        d.classList.remove("closing-drag");
        reset(d);
      }, fast ? 150 : EXIT_MS);
    } else {
      // Vuelve a su lugar con un rebote mínimo (con menos movimiento, sin rebote).
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      d.style.transition = reduce ? "transform 120ms ease-out" : "transform 420ms var(--ease-spring)";
      d.style.transform = "";
      d.style.removeProperty("--sheet-fade");
    }
  }

  // Arrastrar hacia abajo desde la agarradera o el título (solo hoja de celular).
  const dragProps = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" || (e.target as HTMLElement).closest("button")) return;
      dragStart(e.clientY, e.timeStamp);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => dragMove(e.clientY),
    onPointerUp: (e: React.PointerEvent) => dragEnd(e.timeStamp),
  };

  // Desde el contenido también, como en iOS: si está arriba de todo, tirar hacia abajo
  // baja la hoja en vez de no hacer nada (si tiene para subir, primero se desplaza).
  // Con listeners nativos: React los registra pasivos y no dejaría frenar el rebote.
  const body = useRef<HTMLDivElement>(null);
  // Los listeners se ponen una vez: llaman siempre a la versión actual (con el onDismiss de ahora).
  const dragFns = useRef({ dragStart, dragMove, dragEnd });
  useEffect(() => {
    dragFns.current = { dragStart, dragMove, dragEnd };
  });
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    let s: { x: number; y: number; t: number; on: boolean; dead: boolean } | null = null;
    const sheetMode = () => window.matchMedia("(max-width: 639px)").matches;
    const ownScroll = (target: EventTarget | null) => {
      for (let p = target instanceof Element ? target : null; p && p !== el; p = p.parentElement) {
        if (p.closest("[data-no-swipe], input[type=range], [role=slider]")) return true;
        if (p instanceof HTMLElement && p.scrollHeight > p.clientHeight + 1 && p.scrollTop > 0) {
          const oy = getComputedStyle(p).overflowY;
          if (oy === "auto" || oy === "scroll") return true;
        }
      }
      return false;
    };
    const start = (e: TouchEvent) => {
      s = null;
      if (e.touches.length !== 1 || !sheetMode() || el.scrollTop > 0 || ownScroll(e.target)) return;
      const t = e.touches[0];
      s = { x: t.clientX, y: t.clientY, t: e.timeStamp, on: false, dead: false };
    };
    const move = (e: TouchEvent) => {
      if (!s || s.dead) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (!s.on) {
        if (el.scrollTop > 0 || dy < -4 || Math.abs(dx) > Math.abs(dy)) {
          if (dy < -4 || Math.abs(dx) > 8) s.dead = true;
          return;
        }
        // Desde el primer movimiento: si el navegador ya arrancó su gesto, después no se puede frenar.
        if (e.cancelable && dy > 0) e.preventDefault();
        if (dy < 8) return;
        s.on = true;
        // Si había texto enfocado, el teclado se va (si no, la hoja baja con el teclado arriba).
        (document.activeElement as HTMLElement | null)?.blur?.();
        dragFns.current.dragStart(t.clientY, e.timeStamp);
      }
      if (e.cancelable) e.preventDefault();
      dragFns.current.dragMove(t.clientY);
    };
    const end = (e: TouchEvent) => {
      const on = s?.on;
      s = null;
      if (on) dragFns.current.dragEnd(e.timeStamp);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, []);

  return (
    <dialog
      ref={dlg}
      className={cx("sheet", wide && "sheet-wide")}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === dlg.current;
      }}
      onClick={(e) => {
        if (e.target === dlg.current && downOnBackdrop.current) dismiss();
        downOnBackdrop.current = false;
      }}
    >
      <div {...dragProps} onPointerCancel={dragProps.onPointerUp} className="touch-none sm:touch-auto">
        <div aria-hidden className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-line-strong" />
        </div>
      <div className="flex items-center justify-between border-b border-line py-3 pr-3 pl-5 max-sm:pt-1.5">
        <h2 className="display truncate text-[22px]">{title}</h2>
        <IconButton label="Cerrar" type="button" onClick={dismiss}>
          <X size={18} />
        </IconButton>
      </div>
      </div>
      <div ref={body} className="max-h-[calc(92dvh-60px)] overflow-y-auto overscroll-contain px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </dialog>
  );
});

/** Cuadrado de color con el ícono de la categoría, como en HabitNow (en Papel: pastel con tinta). */
export function ToneSquare({
  children,
  size,
  style,
  solid,
  className,
}: {
  children: React.ReactNode;
  /** En px; si no se pasa, el tamaño va por `className` (puede cambiar con la pantalla). */
  size?: number;
  style?: React.CSSProperties;
  /** Lleno (tono profundo con ícono blanco): más contraste que el pastel. */
  solid?: boolean;
  className?: string;
}) {
  const px = size ?? (className ? undefined : 40);
  return (
    <span
      style={{ ...style, ...(px ? { width: px, height: px } : {}) }}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-[8px]",
        solid ? "chip-solid" : "bg-tone text-tone-fg",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Botón de borrar en dos pasos, en lugar de window.confirm: el primer toque
 * pide confirmación en el mismo lugar y a los 5 segundos vuelve solo.
 */
export function ConfirmButton({
  children,
  confirmLabel = "Tocá de nuevo para confirmar",
  onConfirm,
  undo,
  className,
  disabled,
}: {
  children: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  /** Si va a la papelera: el texto del aviso con "Deshacer" ("Movimiento borrado"). */
  undo?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  // El texto cambia con un corrimiento corto (no de golpe): "Borrar" ↔ "Tocá de nuevo…".
  const tick = useTick(armed ? 1 : 0);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      type="button"
      variant="danger"
      disabled={disabled}
      aria-live="polite"
      className={cx(armed && "bg-danger! text-on-accent! hover:opacity-90", className)}
      onClick={() => {
        if (armed) {
          setArmed(false);
          haptic("success");
          onConfirm();
          if (undo) notifyDeleted(undo);
        } else {
          haptic("threshold");
          setArmed(true);
        }
      }}
    >
      <span key={tick.key} className={cx("inline-flex items-center gap-2", tick.className)}>
        {armed ? confirmLabel : children}
      </span>
    </Button>
  );
}
