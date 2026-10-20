"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { montevideoNow, msToNextSlot, pickForSlot, quoteSlot } from "@/lib/quotes";
import type { ValueNote } from "@/lib/values";
import { useSwap } from "@/components/motion";
import { cx } from "@/components/ui";

/**
 * Nota de Facu arriba de Inicio (diseño 3 que eligió: tarjeta oscura con comillas grandes;
 * desde el diseño 4 va a la derecha del saludo, 7 de 12 columnas en la compu).
 * Las notas salen de Herramientas → Valores. Cambia cada 6 horas (00, 06, 12, 18 en
 * Montevideo); la elige el tramo, así es la misma en el celular y en la compu. Si la página
 * queda abierta, cambia sola.
 */
export function QuoteCard({ day, hour, notes, className }: { day: string; hour: number; notes: ValueNote[]; className?: string }) {
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
  const note = pickForSlot(notes, slot);
  const swap = useSwap(String(slot));
  return (
    <figure
      aria-label="Nota de tus valores"
      className={cx("quote-card relative flex min-w-0 flex-col justify-center overflow-hidden rounded-[22px] px-[22px] pt-[22px] pb-4 lg:min-h-[228px] lg:px-9 lg:pt-[30px] lg:pb-[26px]", className)}
    >
      <span aria-hidden className="pointer-events-none absolute -top-6 right-4 text-[128px] leading-none font-bold text-[var(--quote-mark)] select-none lg:right-8 lg:text-[168px]">
        ”
      </span>
      {note ? (
        <div key={slot} className={swap}>
          {/* Las notas largas van más chicas, así no ocupan media pantalla del celular. */}
          <blockquote
            className={cx(
              "relative max-w-[30rem] font-semibold tracking-[-0.015em] text-pretty text-[var(--quote-fg)]",
              note.text.length > 220
                ? "text-[16px] leading-[1.45] lg:text-[17px] xl:text-[19px]"
                : note.text.length > 120
                  ? "text-[18px] leading-[1.38] lg:text-[20px] xl:text-[22px]"
                  : "text-[22px] leading-[1.25] lg:text-[25px] xl:text-[30px] xl:leading-[1.22]",
            )}
          >
            “{note.text}”
          </blockquote>
          <figcaption className="relative mt-3.5 lg:mt-4">
            <Link
              href="/valores"
              className="inline-flex min-h-11 items-center font-mono text-[11.5px] tracking-[0.06em] text-[var(--quote-sub)] uppercase underline-offset-4 hover:underline"
            >
              {note.section ?? "Tus valores"}
            </Link>
          </figcaption>
        </div>
      ) : (
        <div className="relative">
          <p className="max-w-[30rem] text-[19px] leading-[1.35] font-semibold text-[var(--quote-fg)] lg:text-[23px]">Escribí tus valores y acá va a salir uno distinto cada 6 horas.</p>
          <Link href="/valores" className="mt-3 inline-flex min-h-11 items-center font-mono text-[11.5px] tracking-[0.06em] text-[var(--quote-sub)] uppercase underline underline-offset-4">
            Ir a Valores
          </Link>
        </div>
      )}
    </figure>
  );
}
