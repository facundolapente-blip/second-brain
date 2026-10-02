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
import { formatShort } from "@/lib/dates";
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
    <header className="sticky top-0 z-20 bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto max-w-3xl px-4 lg:px-8">
        <div className="flex h-14 items-center gap-2 lg:h-16">
          {back ? (
            <Link
              href={back}
              aria-label="Volver"
              className="-ml-2 inline-flex size-10 items-center justify-center rounded-md text-accent lg:hidden"
            >
              <CaretLeft size={22} weight="bold" />
            </Link>
          ) : (
            <MenuButton />
          )}
          {title && <h1 className="text-[22px] font-semibold tracking-tight lg:text-2xl">{title}</h1>}
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

export function EntryCard({ entry, index = 0 }: { entry: EntryCardDTO; index?: number }) {
  const [day, month] = formatShort(entry.date).split(" ");
  return (
    <Link
      href={`/journal/${entry.id}`}
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
      className="rise group grid gap-2.5 rounded-[14px] border border-line bg-surface px-4 pt-3.5 pb-4 transition-colors hover:border-line-strong active:bg-surface-2 lg:px-5"
    >
      <div className="flex items-center gap-3">
        <span className="flex items-baseline gap-1.5">
          <span className="tabular text-[28px] leading-none font-semibold tracking-tight">{day.padStart(2, "0")}</span>
          <span className="text-[13px] text-muted">{month}</span>
        </span>
        <span className="ml-auto">
          <MoodBadge mood={entry.mood} size={34} />
        </span>
      </div>
      {entry.title && <h3 className="font-serif text-[18px] leading-snug font-semibold tracking-tight">{entry.title}</h3>}
      {entry.excerpt ? (
        <p className="line-clamp-3 font-serif text-[16px] leading-[1.55] text-fg/85">{entry.excerpt}</p>
      ) : (
        !entry.title && <p className="text-sm text-faint">Sin texto</p>
      )}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {entry.tags.slice(0, 4).map((t) => (
            <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-muted">
              #{t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

/** Botón para escribir en un día puntual (desde el calendario). */
export function WriteDayButton({ date, nueva, children }: { date: string; nueva?: boolean; children: React.ReactNode }) {
  const { pending, write } = useWrite();
  return (
    <button
      type="button"
      onClick={() => write(date, nueva)}
      disabled={pending}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3.5 text-sm font-medium whitespace-nowrap text-white transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cx("grid content-start gap-1 rounded-[12px] border border-line bg-surface p-4", className)}>
      <span className="text-[13px] text-muted">{label}</span>
      <span className="tabular text-[26px] leading-tight font-semibold tracking-tight">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
