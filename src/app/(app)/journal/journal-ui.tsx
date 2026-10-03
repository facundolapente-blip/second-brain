"use client";

import Link from "next/link";
import { useTransition } from "react";
import {
  CaretLeft,
  Smiley,
  SmileyBlank,
  SmileyMeh,
  SmileyNervous,
  SmileySad,
  SmileyWink,
  type Icon,
  type IconWeight,
} from "@phosphor-icons/react";
import { MenuButton } from "@/components/shell";
import { cx } from "@/components/ui";
import { formatLong, formatShort } from "@/lib/dates";
import { moodInfo } from "@/lib/journal-logic";
import { writeOnDay } from "@/lib/journal-actions";
import { tone } from "@/lib/palette";
import type { EntryCardDTO } from "@/lib/journal";

// ─── Ánimo ──────────────────────────────────────────────────────────────────

const MOOD_ICONS: Record<string, Icon> = { SmileySad, SmileyNervous, SmileyMeh, Smiley, SmileyWink };

export function MoodIcon({ mood, size = 20, weight = "regular" }: { mood: number | null; size?: number; weight?: IconWeight }) {
  const info = moodInfo(mood);
  const Ico = info ? MOOD_ICONS[info.icon] : SmileyBlank;
  return <Ico size={size} weight={weight} />;
}

/** Cara del ánimo en un círculo de color suave. Sin ánimo no muestra nada. */
export function MoodBadge({ mood, size = 36 }: { mood: number | null; size?: number }) {
  const info = moodInfo(mood);
  if (!info) return null;
  return (
    <span
      style={{ ...tone(info.color), width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-tone text-tone-fg"
      title={info.label}
      aria-label={`Ánimo: ${info.label}`}
    >
      <MoodIcon mood={mood} size={Math.round(size * 0.62)} weight="duotone" />
    </span>
  );
}

// ─── Cabecera ───────────────────────────────────────────────────────────────

/**
 * Como PageHeader, pero en las pantallas secundarias el celular muestra una
 * flecha para volver a Entradas en lugar del menú.
 */
export function JournalHeader({
  title,
  back,
  actions,
  tabs,
  children,
}: {
  title?: string;
  back?: string;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto max-w-3xl px-4 lg:px-8">
        <div className="flex h-16 items-center gap-2 lg:h-20">
          {back ? (
            <Link
              href={back}
              aria-label="Volver"
              className="-ml-1.5 inline-flex size-11 items-center justify-center rounded-full text-fg transition-[background-color,transform] duration-300 ease-spring hover:bg-surface-2 active:scale-90 lg:hidden"
            >
              <CaretLeft size={22} weight="bold" />
            </Link>
          ) : (
            <MenuButton />
          )}
          {title && <h1 className="display truncate text-[26px] font-semibold lg:text-[30px]">{title}</h1>}
          <div className="ml-auto flex items-center gap-0.5">{actions}</div>
        </div>
        {children}
        {tabs}
      </div>
    </header>
  );
}

// ─── Escribir ───────────────────────────────────────────────────────────────

/** Abre la entrada del día o crea una. Sin fecha, es hoy. */
export function useWrite() {
  const [pending, start] = useTransition();
  return {
    pending,
    write: (date?: string, nueva = false) => start(() => writeOnDay(date, nueva)),
  };
}

// ─── Tarjeta de entrada ─────────────────────────────────────────────────────

const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function wordsLabel(n: number) {
  return n === 1 ? "1 palabra" : `${n.toLocaleString("es-UY")} palabras`;
}

/**
 * Tarjeta de la lista: la fecha en una columna propia a la izquierda (día
 * grande, mes y día de la semana chicos) y el texto en serif a la derecha,
 * como una página de diario.
 */
export function EntryCard({ entry, index = 0 }: { entry: EntryCardDTO; index?: number }) {
  const [day, month] = formatShort(entry.date).split(" ");
  const wd = WEEKDAY_SHORT[new Date(`${entry.date}T00:00:00Z`).getUTCDay()];
  return (
    <Link
      href={`/journal/${entry.id}`}
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
      className="rise group grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3.5 card py-4 pr-4 pl-3 transition-[border-color,background-color,transform] duration-300 ease-spring hover:border-line-strong active:scale-[0.99] active:bg-surface-2 lg:gap-x-5 lg:py-5 lg:pr-5 lg:pl-4"
    >
      <span className="grid content-start justify-items-center gap-0.5 pt-0.5 text-center" aria-hidden>
        <span className="num text-[30px] leading-none font-semibold">{day.padStart(2, "0")}</span>
        <span className="text-[12px] leading-tight font-medium text-accent-fg">{month}</span>
        <span className="text-[11px] leading-tight text-muted">{wd}</span>
      </span>

      <span className="grid min-w-0 content-start gap-1.5">
        <span className="sr-only">{formatLong(entry.date)}</span>
        <span className="flex items-start gap-3">
          <span className="grid min-w-0 flex-1 gap-1">
            {entry.title && (
              <span className="font-serif text-[18px] leading-snug font-semibold tracking-tight text-pretty">{entry.title}</span>
            )}
            {entry.excerpt ? (
              <span className="prose-serif line-clamp-3 text-[16px] leading-[1.6] text-fg/85">{entry.excerpt}</span>
            ) : (
              !entry.title && <span className="text-sm text-muted">Sin texto</span>
            )}
          </span>
          <MoodBadge mood={entry.mood} size={30} />
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[12px] text-muted">
          {entry.tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-surface-2 px-2.5 py-1">
              #{t}
            </span>
          ))}
          {entry.tags.length > 3 && <span>+{entry.tags.length - 3}</span>}
          {entry.words > 0 && <span className="tabular ml-auto">{wordsLabel(entry.words)}</span>}
        </span>
      </span>
    </Link>
  );
}

/** Botón para escribir en un día puntual (desde el calendario). */
export function WriteDayButton({
  date,
  nueva,
  children,
  variant = "accent",
}: {
  date: string;
  nueva?: boolean;
  children: React.ReactNode;
  variant?: "accent" | "outline";
}) {
  const { pending, write } = useWrite();
  return (
    <button
      type="button"
      onClick={() => write(date, nueva)}
      disabled={pending}
      className={cx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium whitespace-nowrap transition-[opacity,transform,background-color] duration-300 ease-spring active:scale-[0.97] disabled:opacity-60",
        variant === "accent"
          ? "btn-glow bg-accent font-semibold text-on-accent hover:brightness-105"
          : "border border-line-strong bg-surface/60 text-fg hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}

/** Cifra con su etiqueta. Sin caja: la agrupa el contenedor. */
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("grid content-start gap-1", className)}>
      <span className="text-[13px] text-muted">{label}</span>
      <span className="num text-[32px] leading-tight font-semibold">{value}</span>
      {hint && <span className="text-[12.5px] text-muted">{hint}</span>}
    </div>
  );
}
