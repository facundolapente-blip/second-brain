"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PencilSimple, X } from "@phosphor-icons/react";
import { PhotoStrip } from "@/components/photos";
import { SwapOnChange } from "@/components/motion-wrap";
import { Bone } from "@/components/skeleton";
import { formatLong } from "@/lib/dates";
import { moodInfo, wordCount } from "@/lib/journal-logic";
import type { EntryCardDTO, EntryDTO } from "@/lib/journal";
import { MoodBadge } from "./journal-ui";

const nf = new Intl.NumberFormat("es-UY");
const EVENT = "sb:journal-ver";

/** Lo llama la tarjeta al elegirla en la compu: el panel la dibuja ya con lo que tiene la lista. */
export function previewEntry(entry: EntryCardDTO | null) {
  window.dispatchEvent(new CustomEvent<EntryCardDTO | null>(EVENT, { detail: entry }));
}

/**
 * Panel de lectura de la computadora. Al tocar una tarjeta se ve al instante con lo
 * que ya tiene la lista (título, fecha, extracto, ánimo) y se completa cuando
 * llega la entrada entera del servidor (sin otro fundido: es la misma entrada).
 * Sin entrada elegida muestra `children` (recuerdo y resumen).
 */
export function ReaderSlot({ reading, closeHref, children }: { reading: EntryDTO | null; closeHref: string; children: React.ReactNode }) {
  const [preview, setPreview] = useState<EntryCardDTO | null>(null);
  // Llegó otra entrada por la URL (o se cerró): lo de antes ya no vale.
  const [seen, setSeen] = useState(reading?.id ?? null);
  if (seen !== (reading?.id ?? null)) {
    setSeen(reading?.id ?? null);
    if (preview && preview.id === reading?.id) setPreview(null);
  }
  useEffect(() => {
    const h = (e: Event) => setPreview((e as CustomEvent<EntryCardDTO | null>).detail);
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);

  const showPreview = preview && preview.id !== reading?.id;
  const key = showPreview ? preview.id : (reading?.id ?? "resumen");
  return (
    <SwapOnChange k={key} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      {showPreview ? (
        <EntryPreview entry={preview} closeHref={closeHref} onClose={() => setPreview(null)} />
      ) : reading ? (
        <EntryReader entry={reading} closeHref={closeHref} onClose={() => setPreview(null)} />
      ) : (
        children
      )}
    </SwapOnChange>
  );
}

function ReaderBar({ id, date, title, words, closeHref, onClose }: { id: string; date: string; title: string | null; words: number; closeHref: string; onClose: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-b border-line py-2.5 pr-2.5 pl-7">
      <p className="kicker min-w-0 flex-1 truncate">
        {title ? formatLong(date) : date.slice(0, 4)}
        <span aria-hidden> · </span>
        {words === 1 ? "1 palabra" : `${nf.format(words)} palabras`}
      </p>
      <Link
        href={`/journal/${id}`}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-2"
      >
        <PencilSimple size={15} aria-hidden /> Editar
      </Link>
      <Link
        href={closeHref}
        scroll={false}
        onClick={onClose}
        aria-label="Cerrar lectura"
        title="Cerrar lectura"
        className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors before:absolute before:-inset-1 hover:bg-surface-2 hover:text-fg"
      >
        <X size={17} aria-hidden />
      </Link>
    </div>
  );
}

function Heading({ title, date, mood }: { title: string | null; date: string; mood: number | null }) {
  return (
    <div className="flex items-start gap-4">
      {/* La mayoría de las entradas no tiene título: entonces la fecha hace de título. */}
      <h2 className="display min-w-0 flex-1 text-[34px] leading-[1.08] text-pretty first-letter:uppercase">{title || formatLong(date)}</h2>
      {moodInfo(mood) && <MoodBadge mood={mood} size={40} />}
    </div>
  );
}

/** Lo que ya se sabe por la tarjeta, mientras llega el resto. */
function EntryPreview({ entry, closeHref, onClose }: { entry: EntryCardDTO; closeHref: string; onClose: () => void }) {
  return (
    <article aria-label="Entrada elegida" aria-busy className="min-w-0 rounded-2xl border border-line bg-surface">
      <ReaderBar id={entry.id} date={entry.date} title={entry.title} words={entry.words} closeHref={closeHref} onClose={onClose} />
      <div className="px-7 pt-7 pb-9 xl:px-10">
        <div className="mx-auto grid max-w-[64ch] gap-5">
          <Heading title={entry.title} date={entry.date} mood={entry.mood} />
          {entry.excerpt ? (
            <div className="prose-serif grid gap-4 text-[17.5px] leading-[1.75] text-fg/90">
              <p className="whitespace-pre-line">{entry.excerpt}</p>
            </div>
          ) : (
            !entry.words && <p className="text-[16px] text-muted">Esta entrada no tiene texto.</p>
          )}
          {/* El resto del texto está en camino: renglones de espera (aparecen a los 120 ms, como los esqueletos). */}
          {entry.words > 40 && (
            <div className="grid gap-3 pt-1">
              <Bone className="h-4 w-full" />
              <Bone className="h-4 w-[92%]" />
              <Bone className="h-4 w-[70%]" />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** La entrada entera, con medida de lectura cómoda. Para escribir se abre el editor. */
export function EntryReader({ entry, closeHref, onClose }: { entry: EntryDTO; closeHref: string; onClose?: () => void }) {
  const words = wordCount(entry.body) + wordCount(entry.title ?? "");
  const paragraphs = entry.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <article aria-label="Entrada elegida" className="min-w-0 rounded-2xl border border-line bg-surface">
      <ReaderBar id={entry.id} date={entry.date} title={entry.title} words={words} closeHref={closeHref} onClose={onClose ?? (() => {})} />
      <div className="px-7 pt-7 pb-9 xl:px-10">
        <div className="mx-auto grid max-w-[64ch] gap-5">
          <Heading title={entry.title} date={entry.date} mood={entry.mood} />

          {paragraphs.length === 0 ? (
            <p className="text-[16px] text-muted">Esta entrada no tiene texto.</p>
          ) : (
            <div className="prose-serif grid gap-4 text-[17.5px] leading-[1.75] text-fg/90">
              {paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-line">
                  {p}
                </p>
              ))}
            </div>
          )}

          <PhotoStrip photos={entry.photos} />

          {entry.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-2" aria-label="Etiquetas">
              {entry.tags.map((t) => (
                <li key={t}>
                  <Link
                    href={`/journal?etiqueta=${encodeURIComponent(t)}`}
                    className="inline-flex h-8 items-center rounded-full bg-accent-soft px-3 text-[12.5px] font-medium text-accent-fg transition-opacity hover:opacity-80"
                  >
                    #{t}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}
