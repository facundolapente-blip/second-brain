"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, PencilSimple, X } from "@phosphor-icons/react";
import { TintedCard } from "@/components/tinted-card";
import { PhotoStrip } from "@/components/photos";
import { SwapOnChange } from "@/components/motion-wrap";
import { Bone } from "@/components/skeleton";
import { formatLong } from "@/lib/dates";
import { moodInfo, wordCount } from "@/lib/journal-logic";
import type { EntryCardDTO, EntryDTO } from "@/lib/journal";
import { MoodBadge, StarToggle } from "./journal-ui";

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

/** La entrada en una tarjeta con cabecera teñida: fecha y palabras, Editar y cerrar. */
function ReaderCard({
  id,
  date,
  title,
  words,
  starred,
  closeHref,
  onClose,
  busy,
  children,
}: {
  id: string;
  date: string;
  title: string | null;
  words: number;
  starred: boolean;
  closeHref: string;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TintedCard
      as="article"
      icon={BookOpen}
      title={title ? formatLong(date) : date.slice(0, 4)}
      meta={words === 1 ? "1 palabra" : `${nf.format(words)} palabras`}
      action={
        <span className="flex shrink-0 items-center gap-1.5">
          <StarToggle id={id} starred={starred} variant="pill" />
          <Link href={`/journal/${id}`} className="tcard-pill press">
            <PencilSimple size={14} aria-hidden /> Editar
          </Link>
          <Link
            href={closeHref}
            scroll={false}
            onClick={onClose}
            aria-label="Cerrar lectura"
            title="Cerrar lectura"
            className="tcard-pill press relative px-2.5! before:absolute before:-inset-1"
          >
            <X size={15} aria-hidden />
          </Link>
        </span>
      }
      bodyClassName="px-7! pt-7! pb-9! xl:px-10!"
    >
      <div aria-busy={busy || undefined} className="mx-auto grid w-full max-w-[64ch] gap-5">
        {children}
      </div>
    </TintedCard>
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
    <ReaderCard id={entry.id} date={entry.date} title={entry.title} words={entry.words} starred={entry.starred} closeHref={closeHref} onClose={onClose} busy>
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
    </ReaderCard>
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
    <ReaderCard id={entry.id} date={entry.date} title={entry.title} words={words} starred={entry.starred} closeHref={closeHref} onClose={onClose ?? (() => {})}>
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
    </ReaderCard>
  );
}
