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
  className,
  "aria-label": ariaLabel,
}: {
  name: string;
  defaultValue?: string | null;
  className?: string;
  "aria-label"?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  function fix(el: HTMLInputElement) {
    const n = normalizeTime(el.value);
    if (n === null) {
      el.setCustomValidity("Escribí una hora, por ejemplo 9:30 o 21");
      return;
    }
    el.setCustomValidity("");
    setValue(n);
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
