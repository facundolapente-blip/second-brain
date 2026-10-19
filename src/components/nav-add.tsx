"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
import { haptic } from "./haptics";

/**
 * El "+" de la barra de abajo del celular (como en el Journal): va dentro de la
 * barra y no flota sobre la lista, así nunca tapa una fila. La pantalla abierta
 * decide qué crea escuchando `useOnNew`. Si ninguna pantalla lo escucha y la barra
 * pasó `fallbackHref`, el "+" va ahí (p. ej. Gastos: `/gastos?nuevo=1`).
 */
const EVENT = "sb:nuevo";

export function useOnNew(cb: () => void) {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    const h = (e: Event) => {
      // Avisa al "+" que alguien lo atendió (así no usa `fallbackHref`).
      e.preventDefault();
      ref.current();
    };
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
}

export function NavAddButton({ label, fallbackHref }: { label: string; fallbackHref?: string }) {
  const router = useRouter();
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          const ev = new Event(EVENT, { cancelable: true });
          window.dispatchEvent(ev);
          if (!ev.defaultPrevented && fallbackHref) router.push(fallbackHref, { scroll: false });
        }}
        aria-label={label}
        className="nav-add lift -mt-5 inline-flex size-[58px] items-center justify-center rounded-full bg-ink text-on-ink ring-[5px] ring-bg"
      >
        <Plus size={26} />
      </button>
    </div>
  );
}
