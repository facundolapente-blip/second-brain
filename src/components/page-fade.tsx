"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

/** La última pantalla mostrada (compartida por los template.tsx de todos los módulos). */
let lastPath: string | null = null;

/**
 * Envoltorio de cada `template.tsx`. Next lo vuelve a montar en cada navegación
 * (también al cambiar `?semana=`, `?mes=`), pero el fundido corre solo si cambió
 * la pantalla (otro módulo u otra pestaña): no al cargar la app ni al cambiar
 * parámetros de la misma pantalla (las flechas de semana o mes ya deslizan lo suyo).
 * Arranca en 0,6 de opacidad, así no blanquea la pantalla.
 *
 * Si se vio el esqueleto (`loading.tsx`), el contenido que lo reemplaza entra con el
 * mismo fundido corto (`data-arrived`), en vez de aparecer de golpe.
 */
export function PageFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [fade] = useState(() => lastPath !== null && lastPath !== pathname);
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    lastPath = pathname;
  }, [pathname]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !el.querySelector("main[aria-busy='true']")) return;
    // El esqueleto está a la vista: cuando lo reemplace la pantalla, que entre en fundido.
    const mo = new MutationObserver(() => {
      if (el.querySelector("main[aria-busy='true']")) return;
      el.dataset.arrived = "";
      mo.disconnect();
    });
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return (
    <div ref={box} className={fade ? "page-fade" : undefined}>
      {children}
    </div>
  );
}
