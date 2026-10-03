"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
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
        "inline-flex items-center justify-center gap-2 rounded-[4px] font-medium whitespace-nowrap transition-[background-color,border-color,color,transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none motion-reduce:active:scale-100",
        size === "md" ? "h-11 px-4 text-[14px]" : "h-9 px-3 text-[13px]",
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
        "inline-flex size-9 items-center justify-center rounded-[4px] text-muted transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-surface-2 hover:text-fg active:scale-95 motion-reduce:active:scale-100",
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
      <div className="flex items-center justify-between border-b border-line py-3 pr-3 pl-5">
        <h2 className="display truncate text-[22px]">{title}</h2>
        <IconButton label="Cerrar" type="button" onClick={() => dlg.current?.close()}>
          <X size={18} />
        </IconButton>
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
      className="inline-flex shrink-0 items-center justify-center rounded-[8px] bg-tone text-tone-fg"
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
