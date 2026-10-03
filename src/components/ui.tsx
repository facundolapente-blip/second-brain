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
        "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[background-color,transform,opacity,box-shadow] duration-300 ease-spring active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none",
        size === "md" ? "h-11 px-5 text-sm" : "h-9 px-4 text-[13px]",
        variant === "primary" && "bg-ink text-on-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:opacity-90",
        variant === "accent" && "btn-glow bg-accent font-semibold text-on-accent hover:brightness-105",
        variant === "ghost" && "text-fg hover:bg-surface-2",
        variant === "outline" && "border border-line-strong bg-surface/60 text-fg hover:bg-surface-2",
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
        "inline-flex size-9 items-center justify-center rounded-full text-muted transition-[background-color,color,transform] duration-300 ease-spring before:absolute before:-inset-1 before:content-[''] hover:bg-surface-2 hover:text-fg active:scale-90",
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
      <span className="text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-[12px] border border-line-strong bg-surface-2/60 px-3.5 text-sm text-fg shadow-[inset_0_1px_2px_rgba(var(--shadow-tint),0.06)] placeholder:text-faint outline-none transition-[border-color,box-shadow,background-color] duration-200 focus:border-accent focus:bg-surface focus:ring-4 focus:ring-[var(--focus)]";

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
    <div
      className="grid auto-cols-fr grid-flow-col rounded-full bg-surface-2 p-1 shadow-[inset_0_1px_2px_rgba(var(--shadow-tint),0.08)]"
      role="radiogroup"
    >
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
              "relative h-9 rounded-full px-2 text-[13px] font-medium transition-colors duration-200",
              on ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                aria-hidden
                className="absolute inset-0 rounded-full bg-raised shadow-[inset_0_1px_0_var(--edge),0_1px_2px_rgba(var(--shadow-tint),0.12),0_6px_16px_-8px_rgba(var(--shadow-tint),0.4)]"
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
      <div className="flex items-center justify-between px-5 pt-5 pb-2 sm:pt-4">
        <h2 className="display text-[19px] font-semibold">{title}</h2>
        <IconButton label="Cerrar" type="button" onClick={() => dlg.current?.close()}>
          <X size={18} />
        </IconButton>
      </div>
      <div className="max-h-[calc(92dvh-64px)] overflow-y-auto px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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
      style={{ ...style, width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-[30%] bg-tone-solid bg-[linear-gradient(160deg,rgba(255,255,255,0.28),rgba(255,255,255,0)_55%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_6px_14px_-8px_var(--tone-solid)]"
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
