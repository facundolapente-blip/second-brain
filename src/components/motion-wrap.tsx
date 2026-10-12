"use client";

import { cx } from "./ui";
import { useSlide, useSwap } from "./motion";

/**
 * Envoltorios para páginas del servidor: el contenido que cambia con la dirección
 * (otro mes, semana, período, pestaña) entra deslizándose desde ese lado
 * (`SlideOnChange`) o con un fundido (`SwapOnChange`). Al cargar no se anima nada.
 */
export function SlideOnChange({ k, className, children }: { k: string; className?: string; children: React.ReactNode }) {
  const cls = useSlide(k);
  return (
    <div key={k} className={cx(cls, className)}>
      {children}
    </div>
  );
}

export function SwapOnChange({ k, className, children }: { k: string; className?: string; children: React.ReactNode }) {
  const cls = useSwap(k);
  return (
    <div key={k} className={cx(cls, className)}>
      {children}
    </div>
  );
}
