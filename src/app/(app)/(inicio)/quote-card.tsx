"use client";

import { useEffect, useState } from "react";
import { montevideoNow, msToNextSlot, quoteFor, quoteSlot } from "@/lib/quotes";
import { useSwap } from "@/components/motion";

/**
 * Frase de un estoico arriba de Inicio (diseño 3 que eligió Facu): tarjeta oscura con
 * comillas grandes. Cambia cada 6 horas (00, 06, 12, 18 en Montevideo); la elige el tramo,
 * así es la misma en el celular y en la compu. Si la página queda abierta, cambia sola.
 */
export function QuoteCard({ day, hour }: { day: string; hour: number }) {
  const [slot, setSlot] = useState(() => quoteSlot(day, hour));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      const now = montevideoNow();
      setSlot(quoteSlot(now.day, now.hour));
      clearTimeout(timer);
      timer = setTimeout(sync, msToNextSlot());
    };
    timer = setTimeout(sync, msToNextSlot());
    // Al volver a la app (el celular duerme los temporizadores).
    const onVisible = () => document.visibilityState === "visible" && sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const q = quoteFor(slot);
  const swap = useSwap(String(slot));
  return (
    <figure aria-label="Frase" className="quote-card relative overflow-hidden rounded-[22px] px-5 pt-5 pb-4 lg:col-span-12 lg:px-8 lg:pt-7 lg:pb-6">
      <span aria-hidden className="pointer-events-none absolute -top-6 right-4 text-[128px] leading-none font-bold text-[var(--quote-mark)] select-none lg:right-8 lg:text-[168px]">
        ”
      </span>
      <div key={slot} className={swap}>
        <blockquote className="relative max-w-3xl text-[21px] leading-[1.3] font-semibold tracking-[-0.015em] text-pretty text-[var(--quote-fg)] lg:text-[27px]">
          “{q.text}”
        </blockquote>
        <figcaption className="relative mt-3.5 font-mono text-[11.5px] tracking-[0.06em] text-[var(--quote-sub)] uppercase lg:mt-4">
          {q.author} · {q.source}
        </figcaption>
      </div>
    </figure>
  );
}
