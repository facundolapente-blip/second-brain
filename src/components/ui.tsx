"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { motion } from "motion/react";
import { X } from "@phosphor-icons/react";

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
        "inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-[background-color,transform,opacity,filter] duration-200 ease-[cubic-bezier(0.2,1.2,0.4,1)] active:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none",
        size === "md" ? "h-12 px-5 text-[15px]" : "h-9 px-4 text-sm",
        variant === "primary" && "bg-ink text-on-ink hover:opacity-90",
        variant === "accent" && "bg-accent text-on-accent hover:brightness-110",
        variant === "ghost" && "text-accent-fg hover:bg-accent-soft",
        variant === "outline" && "bg-accent-soft text-accent-fg hover:brightness-[0.97]",
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
        "inline-flex size-9 items-center justify-center rounded-full text-muted transition-[color,background-color,transform] duration-200 before:absolute before:-inset-1 before:content-[''] hover:bg-surface-2 hover:text-fg active:scale-90",
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
      <span className="pl-1 text-[13px] font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="pl-1 text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "field h-11 w-full rounded-md border px-3.5 text-[15px] text-fg placeholder:text-faint outline-none transition-[border-color,box-shadow,background-color] focus:border-accent focus:bg-surface focus:ring-4 focus:ring-[var(--focus)]";

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
  const id = useId();
  return (
    <div className="grid auto-cols-fr grid-flow-col rounded-full bg-surface-3/70 p-1" role="radiogroup">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            type="button"
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative h-9 rounded-full px-2 text-[13px] font-bold transition-colors",
              on ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
                className="absolute inset-0 rounded-full bg-raised shadow-[0_1px_3px_rgba(var(--shadow-tint),0.14)]"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}

export type SheetHandle = { open: () => void; close: () => void };

/**
 * Hoja inferior en el celular, modal centrado en pantalla grande. Usa <dialog>
 * nativo: foco atrapado, Escape y fondo gratis.
 */
export const Sheet = forwardRef<
  SheetHandle,
  { title: string; children: React.ReactNode; onClose?: () => void; defaultOpen?: boolean }
>(function Sheet({ title, children, onClose, defaultOpen }, ref) {
  const dlg = useRef<HTMLDialogElement>(null);
  useImperativeHandle(ref, () => ({
    open: () => dlg.current?.showModal(),
    close: () => dlg.current?.close(),
  }));
  useEffect(() => {
    if (defaultOpen) dlg.current?.showModal();
  }, [defaultOpen]);

  return (
    <dialog
      ref={dlg}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dlg.current) dlg.current?.close();
      }}
    >
      {/* Agarradera decorativa, como en las hojas de iOS. */}
      <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" />
      <div className="flex items-center justify-between gap-3 px-5 pt-2 pb-2 sm:pt-4">
        <h2 className="truncate text-lg font-extrabold tracking-tight">{title}</h2>
        <IconButton label="Cerrar" type="button" onClick={() => dlg.current?.close()} className="bg-surface-2 text-fg">
          <X size={16} weight="bold" />
        </IconButton>
      </div>
      <div className="max-h-[calc(92dvh-64px)] overflow-y-auto px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </dialog>
  );
});

/** Cuadrado de color con el ícono de la categoría, como en HabitNow. */
export function ToneSquare({
  children,
  size = 40,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{ ...style, width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      className="inline-flex shrink-0 items-center justify-center bg-tone-solid text-tone-on shadow-[inset_0_-2px_0_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.25)]"
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
  className,
  disabled,
}: {
  children: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
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
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
