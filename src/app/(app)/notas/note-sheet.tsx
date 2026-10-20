"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ArrowSquareOut, Camera, Trash, X } from "@phosphor-icons/react";
import { Button, cx, Field, Input, inputClass, Sheet, type SheetHandle } from "@/components/ui";
import { PhotoStrip } from "@/components/photos";
import { useSaveOnDismiss } from "@/components/save-on-dismiss";
import { haptic } from "@/components/haptics";
import { tone } from "@/lib/palette";
import {
  classifyNote,
  detectUrl,
  NOTE_BODY_MAX,
  NOTE_PRICE_MAX,
  NOTE_SECTIONS,
  NOTE_TITLE_MAX,
  noteDomain,
  noteFromForm,
  normalizeNoteUrl,
  normalizeTags,
  sectionOf,
  SUGGESTED_TAGS,
  suggestNoteTags,
  NOTE_CATEGORY_MAX,
  normalizeCategory,
  type NoteDTO,
  type NoteSectionId,
} from "@/lib/notes-logic";
import { doneLabel } from "./note-card";

export type NoteSheetHandle = { open: (note?: NoteDTO, preset?: { section?: NoteSectionId | null; category?: string | null }) => void };

/** Lo que hace la pantalla con la hoja, al instante (si el servidor falla, vuelve sola y avisa). */
/** Una categoría propia de una sección, con cuántas notas la usan. */
export type NoteCategory = { section: string; name: string; count: number; color: string };

export type NoteSheetActions = {
  save: (fd: FormData, note: NoteDTO | undefined, files: File[]) => void;
  remove: (note: NoteDTO) => void;
};

/** Hoja para crear o editar una nota. Cerrarla (afuera, X, Escape, arrastrar) guarda lo cambiado. */
export const NoteSheet = forwardRef<NoteSheetHandle, { actions: NoteSheetActions; tags: string[]; categories: NoteCategory[] }>(function NoteSheet(
  { actions, tags, categories },
  ref,
) {
  const sheet = useRef<SheetHandle>(null);
  const [note, setNote] = useState<NoteDTO | undefined>();
  const [preset, setPreset] = useState<NoteSectionId | null>(null);
  const [presetCategory, setPresetCategory] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const dismiss = useRef<(() => void) | null>(null);
  useImperativeHandle(ref, () => ({
    open(n, p) {
      setNote(n);
      setPreset(p?.section ?? null);
      setPresetCategory(p?.category ?? null);
      setKey((k) => k + 1);
      sheet.current?.open();
    },
  }));
  return (
    <Sheet ref={sheet} wide title={note ? "Editar nota" : "Nueva nota"} onDismiss={() => dismiss.current?.()}>
      <NoteForm
        key={key}
        note={note}
        preset={preset}
        presetCategory={presetCategory}
        knownTags={tags}
        categories={categories}
        actions={actions}
        registerDismiss={(fn) => {
          dismiss.current = fn;
        }}
        onDone={() => sheet.current?.close()}
      />
    </Sheet>
  );
});

function NoteForm({
  note,
  preset,
  presetCategory,
  knownTags,
  categories,
  actions,
  registerDismiss,
  onDone,
}: {
  note?: NoteDTO;
  preset: NoteSectionId | null;
  presetCategory: string | null;
  knownTags: string[];
  categories: NoteCategory[];
  actions: NoteSheetActions;
  registerDismiss: (fn: () => void) => void;
  onDone: () => void;
}) {
  const { form, onDismiss } = useSaveOnDismiss(null);
  const closing = useRef(false);
  useEffect(() =>
    registerDismiss(() => {
      closing.current = true;
      onDismiss();
    }),
  );
  const [body, setBody] = useState(note?.body ?? "");
  const [url, setUrl] = useState(note?.url ?? "");
  // Sección elegida a mano (al editar, la que tiene); si no, la sugiere el contenido.
  const [picked, setPicked] = useState<NoteSectionId | null>(note ? sectionOf(note.section).id : preset);
  const [category, setCategory] = useState(note?.category ?? presetCategory ?? "");
  const [tagsText, setTagsText] = useState(note ? note.tags.join(", ") : "");
  const [tagsTouched, setTagsTouched] = useState(!!note);
  const [photoCount, setPhotoCount] = useState(note?.photos.length ?? 0);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const suggested = useMemo(() => classifyNote({ text: body, url }), [body, url]);
  const section = picked ?? suggested;
  const autoTags = suggestNoteTags({ text: body, url }).join(", ");
  const tagsValue = tagsTouched ? tagsText : autoTags;
  const tagList = normalizeTags(tagsValue);
  const detected = !url.trim() ? detectUrl(body) : null;
  const urlInvalid = url.trim() !== "" && !normalizeNoteUrl(url);
  // Las categorías son de cada sección: se ofrecen las que ya se usan ahí.
  const sectionCats = categories.filter((c) => c.section === section);
  const sectionCategories = sectionCats.map((c) => c.name);
  const categoryValue = normalizeCategory(category);
  const offer = [...new Set([...SUGGESTED_TAGS, ...knownTags])].slice(0, 10);

  function toggleTag(t: string) {
    haptic("select");
    const next = tagList.includes(t) ? tagList.filter((x) => x !== t) : [...tagList, t];
    setTagsTouched(true);
    setTagsText(next.join(", "));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fromDismiss = closing.current;
    closing.current = false;
    const fd = new FormData(e.currentTarget);
    const parsed = noteFromForm(fd);
    if (!parsed.ok) {
      // Al cerrar sin nada que guardar no se avisa: se descarta.
      if (!fromDismiss) setError(parsed.error);
      return;
    }
    actions.save(fd, note, files);
    onDone();
  }

  return (
    <form ref={form} onSubmit={submit} className="grid gap-5" noValidate>
      {note && <input type="hidden" name="id" value={note.id} />}
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="tags" value={tagList.join(", ")} />
      <input type="hidden" name="hasPhotos" value={photoCount + files.length > 0 ? "1" : ""} />
      {note && <input type="hidden" name="flags" value="1" />}

      <Field label="Nota">
        <textarea
          name="body"
          lang="es"
          spellCheck
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setError(null);
          }}
          onPaste={(e) => {
            // Pegar solo un link con la nota vacía: va al campo del link (y la sección se sugiere sola).
            const pasted = e.clipboardData.getData("text").trim();
            if (!body.trim() && !url.trim() && /^\S+$/.test(pasted) && normalizeNoteUrl(pasted) && /^(https?:\/\/|www\.)/i.test(pasted)) {
              e.preventDefault();
              setUrl(pasted);
            }
          }}
          autoFocus={!note}
          rows={note ? Math.min(10, Math.max(3, body.split("\n").length + 1)) : 4}
          maxLength={NOTE_BODY_MAX}
          placeholder="Pegá un link o escribí una idea…"
          className={cx(inputClass, "h-auto resize-y py-2.5 leading-relaxed")}
        />
      </Field>

      <Field
        label="Link"
        hint={urlInvalid ? undefined : detected ? `Se toma el link del texto: ${noteDomain(detected)}` : undefined}
      >
        <Input
          name="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          placeholder="https://…"
          aria-invalid={urlInvalid || undefined}
          className={cx(urlInvalid && "border-danger")}
        />
      </Field>
      {urlInvalid && (
        <p role="alert" className="reveal -mt-3 text-[13px] text-danger">
          Ese link no parece válido (tiene que ser http o https).
        </p>
      )}

      <Field label="Título (opcional)">
        <Input
          name="title"
          defaultValue={note?.title ?? ""}
          maxLength={NOTE_TITLE_MAX}
          placeholder={url.trim() || detected ? "Se completa solo con el de la página" : "Un nombre corto"}
        />
      </Field>

      <div className="grid gap-2">
        <span className="kicker">
          Sección
          {!picked && <span className="ml-2 font-sans text-[11.5px] tracking-normal text-muted normal-case">sugerida por el contenido</span>}
        </span>
        <div role="radiogroup" aria-label="Sección" className="flex flex-wrap gap-1.5">
          {NOTE_SECTIONS.map((s) => {
            const on = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  haptic("select");
                  setPicked(s.id);
                }}
                style={tone(s.color)}
                className={cx(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors duration-[var(--dur-quick)]",
                  on ? "chip-solid border-transparent font-medium" : "border-line-strong text-muted hover:text-fg",
                )}
              >
                <s.icon size={15} weight={on ? "fill" : "regular"} aria-hidden />
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <Field label="Categoría (opcional)" hint={sectionCategories.length ? "Elegí una o escribí otra." : `Una categoría propia para ordenar ${sectionOf(section).name}.`}>
          <Input
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={NOTE_CATEGORY_MAX}
            placeholder={section === "videos" ? "IA, Música, Desarrollo personal…" : "Una categoría"}
            autoComplete="off"
          />
        </Field>
        {sectionCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sectionCats.slice(0, 14).map(({ name: c, color }) => {
              const on = categoryValue === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    haptic("select");
                    setCategory(on ? "" : c);
                  }}
                  style={tone(color)}
                  className={cx(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors duration-[var(--dur-quick)]",
                    on ? "chip-solid font-medium" : "bg-surface-2 text-muted hover:text-fg",
                  )}
                >
                  {!on && <span className="size-2 rounded-full bg-[var(--tone-chip)]" aria-hidden />}
                  {c}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {section === "compras" && (
        <Field label="Precio (opcional)" className="reveal">
          <Input name="price" defaultValue={note?.price ?? ""} maxLength={NOTE_PRICE_MAX} placeholder="260 con envío, 95 usd c/u…" />
        </Field>
      )}

      <div className="grid gap-2">
        <Field label="Etiquetas" hint="Separadas por coma.">
          <Input
            value={tagsValue}
            onChange={(e) => {
              setTagsTouched(true);
              setTagsText(e.target.value);
            }}
            placeholder="música, negocios, personal"
            autoComplete="off"
          />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {offer.map((t) => {
            const on = tagList.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTag(t)}
                className={cx(
                  "inline-flex h-8 items-center rounded-full px-3 text-[12.5px] transition-colors duration-[var(--dur-quick)]",
                  on ? "bg-ink text-on-ink" : "bg-surface-2 text-muted hover:text-fg",
                )}
              >
                #{t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <span className="kicker">Fotos</span>
        {note ? (
          <PhotoStrip photos={note.photos} owner={{ noteId: note.id }} onCountChange={setPhotoCount} />
        ) : (
          <>
            {files.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {files.map((f, i) => (
                  <PendingPhoto key={`${f.name}-${i}`} file={f} onRemove={() => setFiles((x) => x.filter((_, j) => j !== i))} />
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <Camera size={18} aria-hidden /> Agregar fotos
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                const list = [...(e.target.files ?? [])].slice(0, 10);
                setFiles((x) => [...x, ...list].slice(0, 10));
                e.target.value = "";
              }}
            />
            {/* Así cerrar la hoja con solo fotos elegidas también guarda. */}
            <input type="hidden" name="pendingPhotos" value={files.length || ""} />
          </>
        )}
      </div>

      {note && (
        <div className="grid gap-1">
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" name="pinned" defaultChecked={note.pinned} className="size-5 accent-[var(--accent)]" />
            Fijada arriba
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" name="done" defaultChecked={note.done} className="size-5 accent-[var(--accent)]" />
            {doneLabel({ section })}
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="reveal text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-2">
        <Button type="submit" disabled={urlInvalid}>
          Guardar
        </Button>
        {note && (
          <div className="grid grid-cols-2 gap-2">
            {note.url ? (
              <a
                href={note.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line-strong text-[14px] font-medium text-fg transition-colors hover:bg-surface-2 active:scale-[0.98]"
              >
                <ArrowSquareOut size={17} aria-hidden /> Abrir link
              </a>
            ) : (
              <span />
            )}
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                haptic("success");
                actions.remove(note);
                onDone();
              }}
            >
              <Trash size={17} aria-hidden /> Borrar
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}

/** Foto elegida para una nota nueva (se sube al guardar). */
function PendingPhoto({ file, onRemove }: { file: File; onRemove: () => void }) {
  // La vista previa sale del archivo (se libera al sacarla o cerrar la hoja).
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    if (img.current) img.current.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <span className="relative aspect-square overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={img} alt="" className="size-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Sacar foto"
        className="absolute top-1 right-1 inline-flex size-7 items-center justify-center rounded-full bg-black/55 text-white"
      >
        <X size={14} />
      </button>
    </span>
  );
}
