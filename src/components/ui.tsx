"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
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
        "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-[background-color,transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
        size === "md" ? "h-10 px-4 text-sm" : "h-8 px-3 text-[13px]",
        variant === "primary" && "bg-ink text-on-ink hover:opacity-90",
        variant === "accent" && "bg-accent text-white hover:opacity-90",
        variant === "ghost" && "text-fg hover:bg-surface-2",
        variant === "outline" && "border border-line-strong text-fg hover:bg-surface-2",
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
        "inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg active:scale-95",
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
  "h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-faint outline-none transition-colors focus:border-fg/40 focus:ring-2 focus:ring-[var(--focus)]";

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
    <div className="grid auto-cols-fr grid-flow-col rounded-md bg-surface-2 p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-8 rounded-[5px] px-2 text-[13px] font-medium transition-colors",
            value === o.value ? "bg-raised text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-muted hover:text-fg",
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
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <IconButton label="Cerrar" type="button" onClick={() => dlg.current?.close()}>
          <X size={18} />
        </IconButton>
      </div>
      <div className="max-h-[calc(92dvh-56px)] overflow-y-auto px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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
      className="inline-flex shrink-0 items-center justify-center rounded-[10px] bg-tone-solid text-white"
    >
      {children}
    </span>
  );
}
