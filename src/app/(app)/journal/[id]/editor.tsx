"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CaretDown, CaretLeft, Check, DotsThreeVertical, Plus, Trash, WarningCircle, X } from "@phosphor-icons/react";
import { Button, cx, IconButton, Sheet, type SheetHandle } from "@/components/ui";
import { formatLong, formatRelative } from "@/lib/dates";
import { deleteEntry, discardIfEmpty, saveEntry, type EntryInput } from "@/lib/journal-actions";
import { isEmptyEntry, MOODS, normalizeTag, TAGS_MAX, TITLE_MAX, wordCount } from "@/lib/journal-logic";
import type { EntryDTO } from "@/lib/journal";
import { tone } from "@/lib/palette";
import { MoodIcon, useWrite } from "../journal-ui";

type Status = "idle" | "pending" | "saving" | "saved" | "error";

const DEBOUNCE = 900;

/**
 * Guardado automático: cada cambio sube un contador de versión y programa un
 * guardado. Los guardados van en fila (nunca dos a la vez) y siempre mandan el
 * último estado, así no se pisa nada aunque la red tarde.
 */
function useAutosave(id: string, initial: EntryInput) {
  const data = useRef(initial);
  const version = useRef(0);
  const saved = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const retry = useRef<() => void>(() => {});

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (version.current === saved.current) return chain.current;
    chain.current = chain.current.then(async () => {
      const v = version.current;
      if (v === saved.current) return;
      setStatus("saving");
      try {
        const r = await saveEntry(id, data.current);
        if (r.ok) {
          saved.current = Math.max(saved.current, v);
          setError(null);
          setStatus(version.current === saved.current ? "saved" : "pending");
        } else {
          setError(r.error);
          setStatus("error");
        }
      } catch {
        setError("No se pudo guardar. Reintentando…");
        setStatus("error");
        timer.current = setTimeout(() => retry.current(), 5000);
      }
    });
    return chain.current;
  }, [id]);

  useEffect(() => {
    retry.current = () => void flush();
  }, [flush]);

  const update = useCallback(
    (patch: Partial<EntryInput>) => {
      data.current = { ...data.current, ...patch };
      version.current++;
      setStatus("pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), DEBOUNCE);
    },
    [flush],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (version.current !== saved.current) {
        void flush();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", onUnload);
      // Al salir del editor por cualquier lado, lo pendiente se guarda igual.
      void flush();
    };
  }, [flush]);

  return { data, update, flush, status, error };
}

export function Editor({ entry, allTags, today }: { entry: EntryDTO; allTags: string[]; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(entry.date);
  const [title, setTitle] = useState(entry.title ?? "");
  const [body, setBody] = useState(entry.body);
  const [mood, setMood] = useState<number | null>(entry.mood);
  const [tags, setTags] = useState<string[]>(entry.tags);
  const { data, update, flush, status, error } = useAutosave(entry.id, {
    date: entry.date,
    title: entry.title ?? "",
    body: entry.body,
    mood: entry.mood,
    tags: entry.tags,
  });
  const moreSheet = useRef<SheetHandle>(null);
  const confirmSheet = useRef<SheetHandle>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const [leaving, startLeaving] = useTransition();
  const [deleting, startDelete] = useTransition();
  const { write } = useWrite();

  // Entrada nueva: directo a escribir.
  useEffect(() => {
    if (!entry.body && !entry.title) bodyRef.current?.focus();
  }, [entry.body, entry.title]);

  function goBack() {
    startLeaving(async () => {
      await flush();
      if (isEmptyEntry({ ...data.current, title: data.current.title || null })) await discardIfEmpty(entry.id);
      router.push("/journal");
    });
  }

  const words = wordCount(body) + wordCount(title);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-rule bg-bg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-[42rem] items-center gap-1 px-2 lg:h-16 lg:px-4">
          <IconButton label="Volver a entradas" onClick={goBack} disabled={leaving} className="size-10 text-fg">
            <CaretLeft size={22} weight="bold" />
          </IconButton>

          {/* La fecha se cambia con el selector nativo del sistema. */}
          <label className="relative inline-flex h-11 min-w-0 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong px-2.5 hover:border-rule hover:bg-surface-2">
            <span className="label-mono truncate text-[11.5px] text-fg">{formatRelative(date, today)}</span>
            <CaretDown size={14} weight="bold" className="shrink-0 text-muted" />
            <input
              ref={dateRef}
              type="date"
              value={date}
              required
              aria-label="Fecha de la entrada"
              onClick={() => dateRef.current?.showPicker?.()}
              onChange={(e) => {
                if (!e.target.value) return;
                setDate(e.target.value);
                update({ date: e.target.value });
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>

          <SaveStatus status={status} />
          <IconButton label="Más opciones" onClick={() => moreSheet.current?.open()} className="size-10">
            <DotsThreeVertical size={22} weight="bold" />
          </IconButton>
        </div>
        {error && (
          <p className="mx-auto max-w-[42rem] px-5 pb-2 text-[13px] text-danger lg:px-8" role="alert">
            {error}
          </p>
        )}
      </header>

      <main className="mx-auto grid max-w-[42rem] gap-6 px-5 pt-2 pb-16 lg:px-8 lg:pt-8">
        <MoodPicker
          value={mood}
          onChange={(m) => {
            setMood(m);
            update({ mood: m });
          }}
        />

        <div className="grid gap-2">
          <textarea
            rows={1}
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => {
              // Un título es una sola línea aunque se pegue texto con saltos.
              const v = e.target.value.replace(/\n+/g, " ");
              setTitle(v);
              update({ title: v });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                bodyRef.current?.focus();
              }
            }}
            placeholder="Título (opcional)"
            aria-label="Título"
            className="autogrow w-full resize-none bg-transparent font-serif text-[26px] leading-[1.2] font-semibold tracking-[-0.015em] text-balance outline-none! placeholder:font-normal placeholder:text-faint lg:text-[30px]"
          />
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              update({ body: e.target.value });
            }}
            placeholder="Contá cómo estuvo tu día."
            aria-label="Texto de la entrada"
            className="prose-serif autogrow min-h-[50dvh] w-full resize-none bg-transparent text-[19px] leading-[1.75] text-fg outline-none! placeholder:text-faint lg:text-[20px]"
          />
        </div>

        <TagEditor
          tags={tags}
          allTags={allTags}
          onChange={(t) => {
            setTags(t);
            update({ tags: t });
          }}
        />

        <p className="label-mono text-[10.5px] text-muted">
          {words === 1 ? "1 palabra" : `${words.toLocaleString("es-UY")} palabras`} · {formatLong(date)}
        </p>
      </main>

      <Sheet ref={moreSheet} title="Entrada">
        <div className="grid gap-1 pb-1">
          <button
            type="button"
            onClick={() => {
              moreSheet.current?.close();
              startLeaving(async () => {
                await flush();
                write(date, true);
              });
            }}
            className="flex h-11 items-center gap-3 rounded-md px-2 text-left text-[15px] hover:bg-surface-2"
          >
            <Plus size={20} className="text-muted" /> Otra entrada para este día
          </button>
          <button
            type="button"
            onClick={() => {
              moreSheet.current?.close();
              confirmSheet.current?.open();
            }}
            className="flex h-11 items-center gap-3 rounded-md px-2 text-left text-[15px] text-danger hover:bg-[var(--st-fail-bg)]"
          >
            <Trash size={20} /> Borrar entrada
          </button>
        </div>
      </Sheet>

      <Sheet ref={confirmSheet} title="¿Borrar esta entrada?">
        <div className="grid gap-5">
          <p className="text-sm leading-relaxed text-muted">
            Se borra la entrada del {formatLong(date)} con todo lo que escribiste. No se puede deshacer.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => confirmSheet.current?.close()}>
              Cancelar
            </Button>
            <Button
              className="bg-danger! text-on-accent!"
              disabled={deleting}
              onClick={() => startDelete(() => deleteEntry(entry.id))}
            >
              <Trash size={16} weight="bold" /> Borrar
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

/** Estado del autoguardado: discreto mientras todo va bien, claro si falla. */
function SaveStatus({ status }: { status: Status }) {
  const busy = status === "saving" || status === "pending";
  return (
    <span
      aria-live="polite"
      className={cx(
        "label-mono ml-auto inline-flex items-center gap-1.5 px-2 text-[10.5px] transition-opacity duration-300",
        status === "error" ? "text-danger" : "text-muted",
        status === "idle" && "opacity-0",
      )}
    >
      {status === "error" ? (
        <WarningCircle size={14} weight="bold" aria-hidden />
      ) : busy ? (
        <span aria-hidden className="size-2 motion-safe:animate-pulse bg-accent" />
      ) : (
        <Check size={13} weight="bold" aria-hidden />
      )}
      {busy ? "Guardando" : status === "error" ? "Sin guardar" : "Guardado"}
    </span>
  );
}

function MoodPicker({ value, onChange }: { value: number | null; onChange: (m: number | null) => void }) {
  return (
    <div role="radiogroup" aria-label="Ánimo del día" className="flex items-center gap-1">
      {MOODS.map((m) => {
        const on = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={m.label}
            title={m.label}
            onClick={() => onChange(on ? null : m.value)}
            style={tone(m.color)}
            className={cx(
              "inline-flex size-11 items-center justify-center rounded-[2px] border transition-[background-color,color,transform] duration-150 active:scale-90 motion-reduce:active:scale-100",
              on ? "border-tone-solid bg-tone text-tone-fg" : "border-transparent text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <MoodIcon mood={m.value} size={on ? 28 : 26} weight={on ? "duotone" : "regular"} />
          </button>
        );
      })}
      <span className="label-mono ml-2 text-muted">
        {value ? MOODS.find((m) => m.value === value)!.label : "Ánimo"}
      </span>
    </div>
  );
}

function TagEditor({
  tags,
  allTags,
  onChange,
}: {
  tags: string[];
  allTags: string[];
  onChange: (t: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const q = normalizeTag(text);
  const suggestions = allTags.filter((t) => !tags.includes(t) && (!q || t.includes(q))).slice(0, 8);

  function add(raw: string) {
    const t = normalizeTag(raw);
    setText("");
    if (!t || tags.includes(t) || tags.length >= TAGS_MAX) return;
    onChange([...tags, t]);
  }

  return (
    <div className="grid gap-2.5 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span key={t} className="inline-flex h-9 items-center gap-1 rounded-[2px] border border-line-strong bg-surface pr-0.5 pl-2.5 font-mono text-[13px]">
            #{t}
            <button
              type="button"
              aria-label={`Quitar ${t}`}
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="inline-flex size-8 items-center justify-center text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X size={12} weight="bold" />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,\n]/.test(v)) v.split(/[,\n]/).forEach((p, i, arr) => (i < arr.length - 1 ? add(p) : setText(p)));
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (text.trim()) add(text);
          }}
          placeholder={tags.length ? "Otra etiqueta" : "Agregar etiqueta"}
          aria-label="Agregar etiqueta"
          enterKeyHint="done"
          autoCapitalize="none"
          className="h-8 min-w-[9rem] flex-1 bg-transparent px-1 text-[14px] outline-none! placeholder:text-faint"
        />
      </div>
      {focused && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              // mousedown para que no se pierda el foco antes del click
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(t)}
              className="h-9 rounded-[2px] border border-dashed border-line-strong px-2.5 font-mono text-[12px] text-muted hover:border-solid hover:text-fg"
            >
              #{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
