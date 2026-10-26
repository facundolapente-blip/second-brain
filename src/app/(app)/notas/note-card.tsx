"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowSquareOut,
  Check,
  CheckCircle,
  DotsThree,
  FolderSimple,
  Globe,
  GoogleDriveLogo,
  InstagramLogo,
  Play,
  Plus,
  PushPin,
  Star,
  SoundcloudLogo,
  SpotifyLogo,
  TiktokLogo,
  XLogo,
  YoutubeLogo,
  type Icon,
} from "@phosphor-icons/react";
import { cx } from "@/components/ui";
import { StarsShow } from "./stars";
import { photoUrl } from "@/components/photos";
import { tone } from "@/lib/palette";
import {
  bodyWithoutUrl,
  isVideoUrl,
  noteDomain,
  noteHeading,
  relativeDay,
  sectionOf,
  type NoteDTO,
} from "@/lib/notes-logic";
import { dayOfInstant } from "@/lib/dates";

const KIND_ICON: Record<string, Icon> = {
  youtube: YoutubeLogo,
  instagram: InstagramLogo,
  tiktok: TiktokLogo,
  spotify: SpotifyLogo,
  soundcloud: SoundcloudLogo,
  x: XLogo,
  drive: GoogleDriveLogo,
};

/** "Visto" para videos, "Hecho" para lo demás. */
export function doneLabel(n: Pick<NoteDTO, "section">) {
  return n.section === "videos" ? "Visto" : "Hecho";
}

export type CardHandlers = {
  onOpen: () => void;
  onToggleDone: () => void;
  onTag: (tag: string) => void;
  /** Toca la categoría (o "+ Categoría"): abre el selector. */
  onCategory: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  /** Botón ⋯ de la tarjeta: el mismo menú que el clic derecho (borrar, mover, categoría…). */
  onMore: (e: React.MouseEvent) => void;
  /** La estrella de la tarjeta: 0 → 1 → 2 → 3 → 0. */
  onStars: () => void;
  /** La chincheta: fija la nota arriba de todo (o la desfija). */
  onPin: () => void;
};

/**
 * Tarjeta de una nota según lo que tenga: video (miniatura 16:9), link (dominio
 * e ícono o imagen de la página), fotos, o texto (4 renglones y "Ver más").
 * Tocarla abre la hoja (el título es el botón, estirado sobre toda la tarjeta);
 * la miniatura y el dominio abren el link en otra pestaña.
 */
export function NoteCard({
  note: n,
  today,
  showSection,
  categoryColor,
  pending,
  handlers,
}: {
  note: NoteDTO;
  today: string;
  /** En "Todas" se ve de qué sección es. */
  showSection: boolean;
  /** Color de la categoría de la nota (de la paleta). */
  categoryColor?: string;
  /** Guardada sin señal, todavía en el aparato. */
  pending?: boolean;
  handlers: CardHandlers;
}) {
  const video = !!n.url && isVideoUrl(n.url);
  const section = sectionOf(n.section);
  const heading = noteHeading(n);
  const text = bodyWithoutUrl(n.body, n.url);
  // Si el texto es lo mismo que se muestra como título, no se repite.
  const rest =
    !n.title && text.trim().split(/\r?\n/)[0]?.trim() === heading
      ? text.trim().split(/\r?\n/).slice(1).join("\n").trim()
      : text;
  const day = relativeDay(dayOfInstant(new Date(n.createdAt)), today);
  const kindIcon = KIND_ICON[n.urlKind ?? ""] ?? Globe;
  // El tilde se dibuja solo después de tocarlo (nunca al cargar).
  const [justMarked, setJustMarked] = useState(false);
  // La foto de la página puede no cargar (link vencido, sitio que no la presta): vuelve al ícono.
  const [imgFailed, setImgFailed] = useState<string | null>(null);
  const showImg = !!n.thumbnail && imgFailed !== n.thumbnail;

  const titleBtn = (cls: string) => (
    <button
      type="button"
      onClick={handlers.onOpen}
      className={cx(
        "text-left after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:outline-none",
        cls,
      )}
    >
      <span
        className={cx(
          n.done && !video && "text-muted line-through decoration-faint",
        )}
      >
        {heading}
      </span>
    </button>
  );

  const meta = (
    <div className="relative z-[1] flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-muted">
      {showSection && (
        <span
          className="inline-flex items-center gap-1"
          style={tone(section.color)}
        >
          <section.icon
            size={13}
            weight="fill"
            className="text-tone-fg"
            aria-hidden
          />
          {section.short ?? section.name}
        </span>
      )}
      {showSection && <span aria-hidden>·</span>}
      <span className="font-mono text-[11.5px] tabular">{day}</span>
      {pending && (
        <span className="rounded-full bg-[var(--st-skip-bg)] px-2 py-0.5 text-[11.5px] text-[var(--st-skip-fg)]">
          Sin subir todavía
        </span>
      )}
      {n.done && !video && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--st-done-bg)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--st-done-fg)]">
          <Check size={11} weight="bold" aria-hidden /> {doneLabel(n)}
        </span>
      )}
      <button
        type="button"
        onClick={handlers.onCategory}
        aria-label={
          n.category
            ? `Categoría: ${n.category}. Cambiarla`
            : "Ponerle una categoría"
        }
        style={n.category ? tone(categoryColor ?? "stone") : undefined}
        className={cx(
          "inline-flex min-h-7 max-w-[14rem] items-center gap-1 rounded-full px-2 text-[12px] transition-[filter,color,border-color]",
          n.category
            ? "chip-solid font-medium hover:brightness-[1.08]"
            : "border border-dashed border-line-strong text-muted hover:border-solid hover:text-fg",
        )}
      >
        {n.category ? (
          <FolderSimple size={12} weight="fill" aria-hidden />
        ) : (
          <Plus size={11} weight="bold" aria-hidden />
        )}
        <span className="truncate">{n.category ?? "Categoría"}</span>
      </button>
      {n.tags.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => handlers.onTag(t)}
          className="inline-flex min-h-7 items-center rounded-full bg-surface-2 px-2 text-[12px] text-muted transition-colors hover:bg-surface-3 hover:text-fg"
        >
          #{t}
        </button>
      ))}
      {/* Chincheta, estrella y ⋯ juntas: si no entran en el renglón, bajan las tres a la derecha. */}
      <span className="ml-auto flex shrink-0 items-center">
        <button
          type="button"
          onClick={handlers.onPin}
          aria-pressed={n.pinned}
          aria-label={
            n.pinned
              ? "Fijada arriba. Tocá para desfijarla"
              : "Fijar arriba de todo"
          }
          title={n.pinned ? "Desfijar" : "Fijar arriba"}
          className={cx(
            "tap-tint inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface-2",
            n.pinned ? "text-accent-fg" : "text-faint hover:text-muted",
          )}
        >
          <PushPin
            size={16}
            weight={n.pinned ? "fill" : "regular"}
            aria-hidden
          />
        </button>
        <button
          type="button"
          onClick={handlers.onStars}
          aria-label={
            n.stars
              ? `Importancia: ${n.stars} de 3 estrellas. Tocá para cambiar`
              : "Marcar como importante"
          }
          title="Importancia"
          className={cx(
            "tap-tint inline-flex min-h-8 shrink-0 items-center justify-center rounded-full px-1.5 transition-colors hover:bg-surface-2",
            !n.stars && "text-faint hover:text-muted",
          )}
        >
          {n.stars ? (
            <StarsShow n={n.stars} size={14} />
          ) : (
            <Star size={16} aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={handlers.onMore}
          aria-label="Más acciones: borrar, mover, fijar…"
          title="Más acciones"
          className="tap-tint inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <DotsThree size={20} weight="bold" aria-hidden />
        </button>
      </span>
    </div>
  );

  const shell = (children: React.ReactNode, cls?: string) => (
    <article
      data-note={n.id}
      onContextMenu={handlers.onContextMenu}
      className={cx(
        "lift relative rounded-[18px] border border-line bg-surface",
        cls,
      )}
    >
      {children}
    </article>
  );

  if (video) {
    return shell(
      <div className="flex gap-3 p-3 lg:grid lg:gap-0 lg:p-0">
        <a
          href={n.url!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Abrir el video: ${heading}`}
          className="press relative z-[1] aspect-video w-[136px] shrink-0 overflow-hidden rounded-xl bg-surface-3 lg:w-full lg:rounded-none lg:rounded-t-[17px]"
        >
          {n.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={n.thumbnail}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className={cx(
                "size-full object-cover transition-opacity duration-[var(--dur-state)]",
                n.done && "opacity-55",
              )}
            />
          ) : (
            <span className="flex size-full items-center justify-center text-faint">
              {(() => {
                const K = kindIcon;
                return <K size={30} aria-hidden />;
              })()}
            </span>
          )}
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-black/55 text-white lg:size-11">
              <Play size={16} weight="fill" />
            </span>
          </span>
          {n.done && (
            <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-semibold text-white">
              <Check size={11} weight="bold" aria-hidden /> Visto
            </span>
          )}
        </a>
        <div className="grid min-w-0 flex-1 content-start gap-1.5 lg:p-4 lg:pt-3">
          {titleBtn(
            "line-clamp-2 pr-6 text-[15px] leading-snug font-semibold lg:pr-0",
          )}
          <div className="relative z-[1] flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
            {(() => {
              const K = kindIcon;
              return <K size={14} aria-hidden className="shrink-0" />;
            })()}
            <span className="truncate">{noteDomain(n.url)}</span>
            <button
              type="button"
              onClick={() => {
                setJustMarked(!n.done);
                handlers.onToggleDone();
              }}
              aria-pressed={n.done}
              aria-label={
                n.done ? "Visto (tocá para desmarcar)" : "Marcar visto"
              }
              className={cx(
                "tap-target ml-auto inline-flex size-8 shrink-0 items-center justify-center gap-1 rounded-full text-[12px] font-medium transition-colors lg:h-7 lg:w-auto lg:px-2.5",
                n.done
                  ? "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]"
                  : "border border-line-strong text-muted hover:text-fg",
              )}
            >
              <CheckCircle
                size={16}
                weight={n.done ? "fill" : "regular"}
                aria-hidden
                className={cx(justMarked && "check-draw")}
              />
              <span className="max-lg:hidden">
                {n.done ? "Visto" : "Marcar visto"}
              </span>
            </button>
          </div>
          {meta}
        </div>
      </div>,
    );
  }

  if (n.url) {
    return shell(
      <div className="grid gap-2 p-3.5 lg:p-4">
        <div className="flex items-start gap-3">
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={n.thumbnail!}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(n.thumbnail)}
              className={cx(
                "shrink-0 rounded-xl bg-white object-cover ring-1 ring-line",
                // En Para comprar la foto es el producto: un poco más grande.
                section.id === "compras" ? "size-16 lg:size-[72px]" : "size-14",
              )}
            />
          ) : (
            <span
              style={tone(section.color)}
              className="chip-solid inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
            >
              {(() => {
                const K =
                  n.urlKind && n.urlKind !== "web" ? kindIcon : section.icon;
                return <K size={20} weight="fill" aria-hidden />;
              })()}
            </span>
          )}
          <div className="grid min-w-0 flex-1 gap-1 pr-6">
            {titleBtn(
              "line-clamp-2 text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]",
            )}
            <a
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-[1] inline-flex min-h-7 max-w-full items-center gap-1 self-start text-[12.5px] text-muted underline-offset-2 hover:text-fg hover:underline"
            >
              <span className="truncate">{noteDomain(n.url)}</span>
              <ArrowSquareOut size={12} className="shrink-0" aria-hidden />
            </a>
          </div>
        </div>
        {n.price && (
          <span className="justify-self-start rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[12.5px] text-accent-fg">
            {n.price}
          </span>
        )}
        {rest && (
          <p className="line-clamp-2 text-[13.5px] whitespace-pre-line text-muted [overflow-wrap:anywhere]">
            {rest}
          </p>
        )}
        {meta}
      </div>,
    );
  }

  if (n.photos.length) {
    const shown = n.photos.slice(0, 3);
    return shell(
      <div className="grid gap-2.5 p-3 lg:p-3.5">
        <div
          className={cx(
            "grid gap-1.5 overflow-hidden rounded-xl",
            shown.length > 1 ? "grid-cols-3" : "grid-cols-1",
          )}
        >
          {shown.map((p, i) => (
            <span
              key={p.id}
              className={cx(
                "relative bg-surface-2",
                shown.length > 1 && i === 0
                  ? "col-span-2 row-span-2 aspect-square"
                  : shown.length > 1
                    ? "aspect-square"
                    : "aspect-[4/3]",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl(p.id)}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover"
              />
              {i === shown.length - 1 && n.photos.length > shown.length && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[14px] font-semibold text-white">
                  +{n.photos.length - shown.length}
                </span>
              )}
            </span>
          ))}
        </div>
        {titleBtn("line-clamp-2 pr-6 text-[15px] leading-snug font-semibold")}
        {rest && (
          <p className="line-clamp-2 text-[13.5px] whitespace-pre-line text-muted">
            {rest}
          </p>
        )}
        {meta}
      </div>,
    );
  }

  return shell(
    <div className="grid gap-2 p-3.5 lg:p-4">
      {n.title ? (
        <>
          {titleBtn(
            "pr-6 text-[15px] leading-snug font-semibold [overflow-wrap:anywhere]",
          )}
          {rest && <Folded text={rest} done={n.done} />}
        </>
      ) : (
        <>
          {/* Sin título: el texto es la tarjeta (el botón invisible la abre). */}
          <button
            type="button"
            onClick={handlers.onOpen}
            aria-label={`Editar: ${heading}`}
            className="absolute inset-0 rounded-[inherit] focus-visible:outline-none"
          />
          <Folded text={n.body} done={n.done} strong />
        </>
      )}
      {meta}
    </div>,
  );
}

/**
 * Texto con 4 renglones como mucho; "Ver más" lo despliega en alto (sin salto)
 * y "Ver menos" lo vuelve a plegar. El botón aparece solo si hay más.
 */
function Folded({
  text,
  done,
  strong,
}: {
  text: string;
  done: boolean;
  strong?: boolean;
}) {
  const box = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [full, setFull] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      if (!open) setMore(el.scrollHeight > el.clientHeight + 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, text]);
  return (
    <div className="grid gap-1">
      <p
        ref={box}
        style={{ maxHeight: open ? (full ?? undefined) : "calc(1.55em * 4)" }}
        className={cx(
          "overflow-hidden whitespace-pre-line [overflow-wrap:anywhere] transition-[max-height] duration-[var(--dur-state)] ease-[var(--ease-out)] motion-reduce:transition-none",
          strong
            ? "pr-6 text-[15px] leading-[1.55] text-fg"
            : "text-[14px] leading-[1.55] text-muted",
          done && "text-muted line-through decoration-faint",
          !open &&
            more &&
            "[mask-image:linear-gradient(to_bottom,black_70%,transparent)]",
        )}
      >
        {text}
      </p>
      {(more || open) && (
        <button
          type="button"
          onClick={() => {
            const el = box.current;
            if (el) setFull(el.scrollHeight);
            setOpen((o) => !o);
          }}
          aria-expanded={open}
          className="relative z-[1] min-h-8 justify-self-start text-[13px] font-medium text-accent-fg hover:underline"
        >
          {open ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}
