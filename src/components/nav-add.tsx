"use client";

import { useEffect, useRef } from "react";
import { Plus } from "@phosphor-icons/react";

/**
 * El "+" de la barra de abajo del celular (como en el Journal): va dentro de la
 * barra y no flota sobre la lista, así nunca tapa una fila. La pantalla abierta
 * decide qué crea escuchando `useOnNew`.
 */
const EVENT = "sb:nuevo";

export function useOnNew(cb: () => void) {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    const h = () => ref.current();
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
}

export function NavAddButton({ label }: { label: string }) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(EVENT))}
        aria-label={label}
        className="lift -mt-5 inline-flex size-[58px] items-center justify-center rounded-full bg-ink text-on-ink ring-[5px] ring-bg transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-95 motion-reduce:transition-none"
      >
        <Plus size={26} />
      </button>
    </div>
  );
}
