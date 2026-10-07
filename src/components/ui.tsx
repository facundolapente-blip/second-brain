"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { notifyDeleted } from "./undo-toast";

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
  function Input({ className, ...props }, ref) {
    return <input ref={ref} {...props} className={cx(inputClass, className)} />;
  },
);

/** Grupo de opciones excluyentes con aspecto de interruptor segmentado. */
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
  return (
    <div className="grid auto-cols-fr grid-flow-col rounded-[5px] border border-line bg-surface-2 p-[3px]" role="radiogroup">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-9 rounded-[3px] px-2 text-[13px] font-medium transition-colors",
            value === o.value ? "bg-raised text-fg shadow-[0_1px_2px_rgba(var(--shadow-tint),0.12)]" : "text-muted hover:text-fg",
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

/**
 * Hoja inferior en el celular, modal centrado en pantalla grande. Usa <dialog>
 * nativo: foco atrapado, Escape y fondo gratis. En el celular se cierra también
 * arrastrando la agarradera hacia abajo; la salida es más rápida que la entrada.
 */
export const Sheet = forwardRef<
  SheetHandle,
  { title: string; children: React.ReactNode; onClose?: () => void; defaultOpen?: boolean }
>(function Sheet({ title, children, onClose, defaultOpen }, ref) {
  const dlg = useRef<HTMLDialogElement>(null);
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);

  function reset(d: HTMLDialogElement) {
    d.classList.remove("closing");
    d.style.transform = "";
    d.style.transition = "";
  }
  function open() {
    const d = dlg.current;
    if (!d) return;
    clearTimeout(closing.current);
    reset(d);
    if (!d.open) d.showModal();
  }
  /** Cierra con la animación de salida (o al toque si se pidió menos movimiento). */
  function close() {
    const d = dlg.current;
    if (!d?.open || d.classList.contains("closing")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return d.close();
    d.classList.add("closing");
    closing.current = setTimeout(() => {
      d.close();
      reset(d);
    }, 170);
  }
  useImperativeHandle(ref, () => ({ open, close }));
  useEffect(() => {
    if (defaultOpen) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultOpen]);
  useEffect(() => () => clearTimeout(closing.current), []);

  // Arrastrar hacia abajo desde la agarradera o el título (solo hoja de celular).
  const dragProps = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" || (e.target as HTMLElement).closest("button")) return;
      drag.current = { y: e.clientY, t: e.timeStamp, dy: 0 };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const g = drag.current;
      const d = dlg.current;
      if (!g || !d) return;
      g.dy = Math.max(0, e.clientY - g.y);
      d.style.transition = "none";
      d.style.transform = `translateY(${g.dy}px)`;
    },
    onPointerUp: (e: React.PointerEvent) => {
      const g = drag.current;
      const d = dlg.current;
      drag.current = null;
      if (!g || !d) return;
      const fast = g.dy / Math.max(1, e.timeStamp - g.t) > 0.6;
      if (g.dy > 90 || (fast && g.dy > 24)) {
        d.style.transition = "transform 170ms cubic-bezier(0.4, 0, 1, 1)";
        d.style.transform = "translateY(100%)";
        clearTimeout(closing.current);
        closing.current = setTimeout(() => {
          d.close();
          reset(d);
        }, 170);
      } else {
        d.style.transition = "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)";
        d.style.transform = "";
      }
    },
  };

  return (
    <dialog
      ref={dlg}
      className="sheet"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === dlg.current) close();
      }}
    >
      <div {...dragProps} onPointerCancel={dragProps.onPointerUp} className="touch-none sm:touch-auto">
        <div aria-hidden className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-line-strong" />
        </div>
      <div className="flex items-center justify-between border-b border-line py-3 pr-3 pl-5 max-sm:pt-1.5">
        <h2 className="display truncate text-[22px]">{title}</h2>
        <IconButton label="Cerrar" type="button" onClick={close}>
          <X size={18} />
        </IconButton>
      </div>
      </div>
      <div className="max-h-[calc(92dvh-60px)] overflow-y-auto px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
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
          onConfirm();
          if (undo) notifyDeleted(undo);
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
