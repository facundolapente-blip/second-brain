"use client";

import { useSafeTransition } from "@/components/safe-action";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, CaretLeft, Smiley, SmileyBlank, SmileyMeh, SmileyNervous, SmileySad, SmileyWink, type Icon, type IconWeight } from "@phosphor-icons/react";
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
  wide,
}: {
  title?: string;
  back?: string;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  children?: React.ReactNode;
  /** En la computadora usa el ancho de las pantallas con panel lateral. */
  wide?: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className={cx("mx-auto max-w-3xl px-4 lg:px-10", wide && "lg:max-w-6xl")}>
        <div className="flex min-h-16 items-center gap-2 lg:min-h-24 lg:items-end lg:pb-4">
          {back ? (
            <Link
              href={back}
              aria-label="Volver"
              className="-ml-2.5 inline-flex size-11 items-center justify-center rounded-[4px] text-fg lg:hidden"
            >
              <CaretLeft size={22} />
            </Link>
          ) : (
            <MenuButton />
          )}
          {title && <h1 className="display pb-0.5 text-[28px] lg:text-[40px]">{title}</h1>}
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
  const [pending, start] = useSafeTransition();
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
export function EntryCard({
  entry,
  index = 0,
  selectHref,
  selected,
}: {
  entry: EntryCardDTO;
  index?: number;
  /** En la computadora, tocar la tarjeta la abre en el panel de lectura (esta URL) en lugar del editor. */
  selectHref?: string;
  selected?: boolean;
}) {
  const router = useRouter();
  const [day, month] = formatShort(entry.date).split(" ");
  const wd = WEEKDAY_SHORT[new Date(`${entry.date}T00:00:00Z`).getUTCDay()];
  return (
    <Link
      href={`/journal/${entry.id}`}
      aria-current={selected ? "true" : undefined}
      onClick={(e) => {
        if (!selectHref || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (!window.matchMedia("(min-width: 1024px)").matches) return;
        e.preventDefault();
        router.replace(selectHref, { scroll: false });
      }}
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
      className={cx(
        "rise group -mx-2 grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 rounded-[6px] border-b border-line px-2 py-5 transition-colors duration-200 last:border-b-0 hover:bg-surface-2/70 active:bg-surface-2 lg:-mx-3 lg:grid-cols-[3.5rem_minmax(0,1fr)] lg:gap-x-5 lg:rounded-xl lg:px-4 lg:py-5",
        selected && "lg:border-transparent lg:bg-surface lg:shadow-[var(--card-shadow),0_0_0_1px_var(--card-ring)] lg:hover:bg-surface",
      )}
    >
      <span className="grid content-start justify-items-center gap-0.5 pt-0.5 text-center" aria-hidden>
        <span className="figure text-[38px] lg:text-[40px]">{day.padStart(2, "0")}</span>
        <span className="kicker mt-1.5 text-fg!">{month}</span>
        <span className="kicker text-[10px]!">{wd}</span>
      </span>

      <span className="grid min-w-0 content-start gap-1.5">
        <span className="sr-only">{formatLong(entry.date)}</span>
        <span className="flex items-start gap-3">
          <span className="grid min-w-0 flex-1 gap-1">
            {entry.title && (
              <span className="display text-[21px] leading-snug text-pretty">{entry.title}</span>
            )}
            {entry.excerpt ? (
              <span className="prose-serif line-clamp-3 text-[17px] leading-[1.6] text-fg/85">{entry.excerpt}</span>
            ) : (
              !entry.title && <span className="display text-[17px] text-muted">Sin texto</span>
            )}
          </span>
          <MoodBadge mood={entry.mood} size={30} />
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 text-[12.5px] text-muted">
          {entry.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-accent-fg">
              #{t}
            </span>
          ))}
          {entry.tags.length > 3 && <span>+{entry.tags.length - 3}</span>}
          {entry.photos > 0 && (
            <span className="inline-flex items-center gap-1" title={entry.photos === 1 ? "1 foto" : `${entry.photos} fotos`}>
              <Camera size={13} aria-hidden />
              <span className="font-mono text-[11px] tabular">{entry.photos}</span>
              <span className="sr-only">{entry.photos === 1 ? "foto" : "fotos"}</span>
            </span>
          )}
          {entry.words > 0 && <span className="ml-auto font-mono text-[11px] tabular">{wordsLabel(entry.words)}</span>}
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
        "inline-flex h-11 items-center justify-center gap-2 rounded-[4px] px-4 text-sm font-medium whitespace-nowrap transition-[opacity,transform,background-color] active:scale-[0.98] disabled:opacity-60",
        variant === "accent" ? "bg-ink text-on-ink hover:opacity-85" : "border border-line-strong text-fg hover:bg-surface-2",
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
      <span className="kicker">{label}</span>
      <span className="figure pt-1 text-[38px]">{value}</span>
      {hint && <span className="text-[13px] text-muted">{hint}</span>}
    </div>
  );
}
