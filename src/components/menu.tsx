"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cx } from "./ui";

export type MenuItem = { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean };

/**
 * Menú desplegable chico (los tres puntitos). Cierra al tocar afuera o con Escape.
 * Teclado como un menú de verdad: al abrir, el foco va al primer ítem; flechas,
 * Inicio y Fin lo mueven; Escape cierra y devuelve el foco al botón. El botón
 * (que arma cada pantalla) recibe solo `aria-haspopup` y `aria-expanded`.
 */
export function Menu({ trigger, items, align = "right" }: { trigger: (toggle: () => void) => React.ReactNode; items: MenuItem[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  // Al cerrar, queda un instante con la animación de salida antes de irse.
  const [leaving, setLeaving] = useState(false);
  // Si abajo no entra (la barra del celular lo taparía), se abre hacia arriba.
  const [up, setUp] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const menuId = useId();
  /** El botón que abre el menú (lo primero que se enfoca dentro de la caja). */
  const button = () => box.current?.querySelector<HTMLElement>("button, a[href], [tabindex]") ?? null;
  function close() {
    if (open) setLeaving(true);
  }
  const shown = open && !leaving;
  // El botón lo arma cada pantalla: acá se le ponen los atributos del menú.
  useEffect(() => {
    const b = button();
    if (!b || b.closest("[role=menu]")) return;
    b.setAttribute("aria-haspopup", "menu");
    b.setAttribute("aria-expanded", String(shown));
    if (shown) b.setAttribute("aria-controls", menuId);
    else b.removeAttribute("aria-controls");
  });
  // Al abrir, el foco entra al primer ítem.
  useEffect(() => {
    if (shown) list.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [shown]);
  function onListKey(e: React.KeyboardEvent) {
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (at + 1) % items.length;
    else if (e.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else if (e.key === "Tab") close();
    if (next >= 0) {
      e.preventDefault();
      items[next].focus();
    }
  }
  function toggle() {
    if (open) setLeaving(true);
    else {
      setUp(false);
      setOpen(true);
    }
  }
  // La salida dura 120 ms y después se saca el menú.
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => {
      setOpen(false);
      setLeaving(false);
    }, 120);
    return () => clearTimeout(t);
  }, [leaving]);
  useLayoutEffect(() => {
    if (!open || !list.current || !box.current) return;
    const r = list.current.getBoundingClientRect();
    // 96 px: la barra de abajo del celular (y un margen).
    if (r.bottom > window.innerHeight - 96 && box.current.getBoundingClientRect().top > r.height + 16) setUp(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Que no cierre también la hoja de atrás.
      e.preventDefault();
      if (box.current?.contains(document.activeElement)) button()?.focus();
      close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leaving]);

  return (
    <div ref={box} className="relative">
      {trigger(toggle)}
      {open && (
        <div
          ref={list}
          id={menuId}
          role="menu"
          onKeyDown={onListKey}
          className={cx(
            "absolute z-30 min-w-48 overflow-hidden rounded-[6px] border border-line-strong bg-surface py-1 shadow-[0_10px_30px_-16px_rgba(var(--shadow-tint),0.35)]",
            leaving ? "menu-out" : "menu-in",
            up ? "bottom-full mb-1" : "top-full mt-1",
            align === "right" ? (up ? "right-0 origin-bottom-right" : "right-0 origin-top-right") : up ? "left-0 origin-bottom-left" : "left-0 origin-top-left",
          )}
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              tabIndex={-1}
              onClick={() => {
                // El foco vuelve al botón (si la acción abre una hoja, la hoja lo toma).
                button()?.focus();
                close();
                it.onSelect();
              }}
              className={cx(
                "flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left text-[14px] transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
                it.danger ? "text-danger" : "text-fg",
              )}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
