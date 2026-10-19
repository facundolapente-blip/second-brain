"use client";

import { useState } from "react";
import { normalizeTime } from "@/lib/plan-logic";
import { cx, inputClass } from "./ui";

/**
 * Hora que se escribe con el teclado numérico (en el celular, `type="time"` obliga a usar
 * el reloj). Al salir del campo o con Enter se acomoda a HH:MM: "930" → 09:30, "21" → 21:00.
 * Si no es una hora, el formulario no se manda y lo dice.
 */
export function TimeInput({
  name,
  defaultValue,
  value: controlled,
  onValueChange,
  onCommit,
  className,
  "aria-label": ariaLabel,
}: {
  name: string;
  defaultValue?: string | null;
  /** Controlado desde afuera (con `onValueChange`), p. ej. el fin que se corre con el inicio. */
  value?: string;
  onValueChange?: (v: string) => void;
  /** La hora ya acomodada, al salir del campo o con Enter. */
  onCommit?: (v: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const value = controlled ?? own;
  const setValue = (v: string) => (onValueChange ? onValueChange(v) : setOwn(v));
  function fix(el: HTMLInputElement) {
    const n = normalizeTime(el.value);
    if (n === null) {
      el.setCustomValidity("Escribí una hora, por ejemplo 9:30 o 21");
      return;
    }
    el.setCustomValidity("");
    setValue(n);
    onCommit?.(n);
  }
  return (
    <input
      name={name}
      value={value}
      inputMode="numeric"
      autoComplete="off"
      enterKeyHint="next"
      placeholder="--:--"
      maxLength={5}
      aria-label={ariaLabel}
      onChange={(e) => {
        e.currentTarget.setCustomValidity("");
        setValue(e.target.value.replace(/[^\d:.\s]/g, ""));
      }}
      onBlur={(e) => fix(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === "Enter") fix(e.currentTarget);
      }}
      className={cx(inputClass, "tabular font-mono", className)}
    />
  );
}
