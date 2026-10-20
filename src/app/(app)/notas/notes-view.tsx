"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import {
  ArrowSquareOut,
  CheckCircle,
  CircleNotch,
  FolderSimple,
  MagnifyingGlass,
  NotePencil,
  Plus,
  PushPin,
  Trash,
  X,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { PillSwitch } from "@/components/pill-switch";
import { SwipeRow } from "@/components/swipe-row";
import { showContextMenu } from "@/components/context-menu";
import { leaveThen, useNewIds } from "@/components/motion";
import { useOnNew } from "@/components/nav-add";
import { useSafeTransition } from "@/components/safe-action";
import { notifyDeleted, notifyError, notifyInfo } from "@/components/undo-toast";
import { haptic } from "@/components/haptics";
import { sendPhoto } from "@/components/photos";
import { plainClick } from "@/components/tab-nav";
import { Button, cx, inputClass, Sheet, type SheetHandle } from "@/components/ui";
import { tone } from "@/lib/palette";
import { newClientId } from "@/lib/plan-logic";
import { NOTE_SECTIONS, noteFromForm, noteHeading, sectionOf, youtubeId, youtubeThumb, type NoteDTO, type NoteSectionId } from "@/lib/notes-logic";
import { deleteNote, moveNoteSection, saveNote, setNoteDone, setNotePinned } from "@/lib/offline/notes";
import { usePendingActions, type QueuedOp } from "@/lib/offline/queue";
import { doneLabel, NoteCard } from "./note-card";
import { NoteSheet, type NoteSheetActions, type NoteSheetHandle } from "./note-sheet";

type Filters = { section: NoteSectionId | null; q: string; tag: string; later: boolean; limit: number };
type Counts = { all: number; bySection: Record<string, number>; laterVideos: number };
type Change = { add: NoteDTO } | { remove: string } | (Partial<NoteDTO> & { id: string });

const PAGE = 60;

function hrefOf(f: Partial<Filters>, extra?: Record<string, string>) {
  const p = new URLSearchParams();
  if (f.section) p.set("seccion", f.section);
  if (f.section === "videos" && f.later) p.set("ver", "despues");
  if (f.q) p.set("q", f.q);
  if (f.tag) p.set("etiqueta", f.tag);
  for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
  const s = p.toString();
  return s ? `/notas?${s}` : "/notas";
}

function applyChange(list: NoteDTO[], c: Change): NoteDTO[] {
  if ("add" in c) return list.some((n) => n.id === c.add.id) ? list.map((n) => (n.id === c.add.id ? c.add : n)) : [c.add, ...list];
  if ("remove" in c) return list.filter((n) => n.id !== c.remove);
  return list.map((n) => (n.id === c.id ? { ...n, ...c } : n));
}

/**
 * Notas nuevas guardadas sin señal (en la cola del aparato): se ven en la lista con
 * "Sin subir todavía" hasta que suben. Las ediciones pendientes aparecen al subir.
 */
function pendingNotes(ops: QueuedOp[]): NoteDTO[] {
  const out: NoteDTO[] = [];
  for (const op of ops) {
    if (op.name !== "notes.saveNote") continue;
    const pairs = (op.args[1] as { __fd?: [string, string][] } | undefined)?.__fd;
    if (!pairs) continue;
    const fd = { get: (k: string) => pairs.find(([x]) => x === k)?.[1] ?? null };
    const id = fd.get("clientId");
    if (fd.get("id") || !id) continue;
    const parsed = noteFromForm(fd);
    if (!parsed.ok) continue;
    const yt = youtubeId(parsed.note.url);
    out.push({ id, source: "app", createdAt: new Date(op.at).toISOString(), photos: [], pinned: false, done: false, ...parsed.note, thumbnail: yt ? youtubeThumb(yt) : null });
  }
  return out;
}

/** Fijadas arriba; después de la más nueva a la más vieja. */
function byPinned(a: NoteDTO, b: NoteDTO) {
  return Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

export function NotesView({
  notes,
  hasMore,
  counts,
  tags,
  filters,
  today,
  openNew,
}: {
  notes: NoteDTO[];
  hasMore: boolean;
  counts: Counts;
  tags: string[];
  filters: Filters;
  today: string;
  openNew: boolean;
}) {
  const router = useRouter();
  const sheet = useRef<NoteSheetHandle>(null);
  const moveSheet = useRef<SheetHandle>(null);
  const [moving, setMoving] = useState<NoteDTO | null>(null);
  const [list, apply] = useOptimistic(notes, applyChange);
  const [, start] = useSafeTransition();

  const pendingOps = usePendingActions();
  const pending = useMemo(() => pendingNotes(pendingOps), [pendingOps]);
  const pendingIds = new Set(pending.map((n) => n.id));
  const visible = [...pending.filter((p) => !list.some((n) => n.id === p.id)), ...list]
    .filter((n) => (!filters.section || sectionOf(n.section).id === filters.section) && (!filters.later || !n.done))
    .sort(byPinned);
  const fresh = useNewIds(visible.map((n) => n.id));

  const newNote = () => sheet.current?.open(undefined, { section: filters.section });
  useOnNew(newNote);
  // Atajo del ícono de la app (/notas?nuevo=1): abre la hoja y saca el parámetro.
  const opened = useRef(false);
  useEffect(() => {
    if (!openNew || opened.current) return;
    opened.current = true;
    sheet.current?.open(undefined, { section: filters.section });
    router.replace(hrefOf(filters), { scroll: false });
  }, [openNew, filters, router]);

  const sheetActions: NoteSheetActions = {
    save(fd, note, files) {
      const id = note?.id ?? newClientId();
      if (!note) fd.set("clientId", id);
      const parsed = noteFromForm(fd);
      if (!parsed.ok) return;
      const p = parsed.note;
      const yt = youtubeId(p.url);
      const next: NoteDTO = {
        id,
        source: note?.source ?? "app",
        createdAt: note?.createdAt ?? new Date().toISOString(),
        photos: note?.photos ?? [],
        ...p,
        thumbnail: yt ? youtubeThumb(yt) : note && note.url === p.url ? note.thumbnail : null,
        pinned: note ? fd.get("pinned") === "on" : false,
        done: note ? fd.get("done") === "on" : false,
      };
      start(async () => {
        apply(note ? next : { add: next });
        const r = await saveNote(null, fd);
        if (r && !r.ok) {
          notifyError(`No se guardó: ${r.error}`);
          return;
        }
        if (!files.length) return;
        if (r && "queued" in r) {
          notifyError("Sin señal: la nota quedó guardada en el aparato, las fotos no. Agregalas cuando vuelva la conexión.");
          return;
        }
        const noteId = r && "id" in r ? r.id : id;
        let failed = 0;
        for (const f of files) {
          try {
            await sendPhoto(f, { noteId });
          } catch {
            failed++;
          }
        }
        if (failed) notifyError(failed === 1 ? "Una foto no se pudo subir." : `${failed} fotos no se pudieron subir.`);
        router.refresh();
      });
    },
    remove(note) {
      leaveThen(`[data-note="${note.id}"]`, () =>
        start(async () => {
          apply({ remove: note.id });
          await deleteNote(note.id);
        }),
      );
      notifyDeleted("Nota borrada");
    },
  };

  function toggleDone(n: NoteDTO) {
    const done = !n.done;
    haptic(done ? "success" : "tap");
    const run = () =>
      start(async () => {
        apply({ id: n.id, done });
        await setNoteDone(n.id, done);
      });
    // En "Ver después", lo visto se va de la lista con una salida corta.
    if (done && filters.later) {
      leaveThen(`[data-note="${n.id}"]`, run);
      notifyInfo(`"${noteHeading(n)}" ${n.section === "videos" ? "visto" : "hecho"}`);
    } else run();
  }
  function togglePin(n: NoteDTO) {
    haptic("select");
    start(async () => {
      apply({ id: n.id, pinned: !n.pinned });
      await setNotePinned(n.id, !n.pinned);
    });
  }
  function move(n: NoteDTO, section: NoteSectionId) {
    if (section === sectionOf(n.section).id) return;
    haptic("select");
    const run = () =>
      start(async () => {
        apply({ id: n.id, section });
        await moveNoteSection(n.id, section);
      });
    if (filters.section) leaveThen(`[data-note="${n.id}"]`, run);
    else run();
    notifyInfo(`Movida a ${sectionOf(section).name}`);
  }

  function contextMenu(e: React.MouseEvent, n: NoteDTO) {
    showContextMenu(
      e,
      [
        { label: "Editar", icon: <NotePencil size={15} />, onSelect: () => sheet.current?.open(n) },
        ...(n.url ? [{ label: "Abrir link", icon: <ArrowSquareOut size={15} />, onSelect: () => window.open(n.url!, "_blank", "noopener,noreferrer") }] : []),
        { label: n.pinned ? "Desfijar" : "Fijar arriba", icon: <PushPin size={15} />, onSelect: () => togglePin(n) },
        {
          label: n.done ? `Marcar como no ${doneLabel(n).toLowerCase()}` : `Marcar como ${doneLabel(n).toLowerCase()}`,
          icon: <CheckCircle size={15} />,
          onSelect: () => toggleDone(n),
        },
        {
          label: "Mover a…",
          icon: <FolderSimple size={15} />,
          onSelect: () => {
            setMoving(n);
            moveSheet.current?.open();
          },
        },
        { label: "Borrar", icon: <Trash size={15} />, danger: true, onSelect: () => sheetActions.remove(n) },
      ],
      noteHeading(n),
    );
  }

  const section = filters.section ? sectionOf(filters.section) : null;
  const searching = !!(filters.q || filters.tag);

  return (
    <>
      <PageHeader
        title="Notas"
        wide
        actions={
          <Button variant="accent" size="sm" className="max-lg:hidden" onClick={newNote}>
            <Plus size={16} weight="bold" /> Nueva nota
          </Button>
        }
      />
      <main className="mx-auto grid max-w-3xl min-w-0 gap-4 px-4 pt-1 pb-10 lg:max-w-6xl lg:gap-5 lg:px-10 lg:pt-4">
        <SearchBox filters={filters} />
        <SectionPills filters={filters} counts={counts} />

        {(filters.section === "videos" || filters.tag) && (
          <div className="flex flex-wrap items-center gap-2">
            {filters.section === "videos" && (
              <PillSwitch
                label="Qué videos"
                value={filters.later ? "despues" : "todos"}
                options={[
                  { value: "despues", label: `Ver después · ${counts.laterVideos}` },
                  { value: "todos", label: "Todos" },
                ]}
                hrefOf={(v) => hrefOf({ ...filters, later: v === "despues" })}
              />
            )}
            {filters.tag && (
              <Link
                href={hrefOf({ ...filters, tag: "" })}
                scroll={false}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-[13px] text-on-ink"
                aria-label={`Sacar el filtro #${filters.tag}`}
              >
                #{filters.tag} <X size={13} weight="bold" aria-hidden />
              </Link>
            )}
          </div>
        )}

        {visible.length === 0 ? (
          <Empty section={section} searching={searching} later={filters.later} onNew={newNote} />
        ) : (
          <div className="grid gap-3 lg:block lg:columns-2 lg:gap-4 xl:columns-3">
            {visible.map((n) => (
              <div key={n.id} className={cx("min-w-0 lg:mb-4 lg:break-inside-avoid", fresh.has(n.id) && "reveal")}>
                <SwipeRow
                  className="rounded-[18px] lg:overflow-visible"
                  left={{ label: doneLabel(n), icon: <CheckCircle size={20} weight="bold" />, tone: "done", onAction: () => toggleDone(n) }}
                  right={{ label: "Borrar", icon: <Trash size={20} weight="bold" />, tone: "danger", onAction: () => sheetActions.remove(n) }}
                >
                  <NoteCard
                    note={n}
                    today={today}
                    showSection={!filters.section}
                    pending={pendingIds.has(n.id)}
                    handlers={{
                      onOpen: () => sheet.current?.open(n),
                      onToggleDone: () => toggleDone(n),
                      onTag: (t) => router.push(hrefOf({ ...filters, tag: t }), { scroll: false }),
                      onContextMenu: (e) => contextMenu(e, n),
                    }}
                  />
                </SwipeRow>
              </div>
            ))}
          </div>
        )}

        {hasMore && (
          <Link
            href={hrefOf(filters, { n: String(filters.limit + PAGE) })}
            scroll={false}
            className="mx-auto inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-[14px] font-medium text-fg transition-colors hover:bg-surface-2"
          >
            Ver más notas
          </Link>
        )}
      </main>

      <NoteSheet ref={sheet} actions={sheetActions} tags={tags} />

      <Sheet ref={moveSheet} title="Mover a">
        {moving && (
          <div className="grid gap-1.5">
            {NOTE_SECTIONS.map((s) => {
              const current = sectionOf(moving.section).id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={current}
                  onClick={() => {
                    moveSheet.current?.close();
                    move(moving, s.id);
                  }}
                  className="tap-tint flex min-h-12 items-center gap-3 rounded-xl px-2 text-left text-[15px] disabled:opacity-60"
                >
                  <span style={tone(s.color)} className="chip-solid inline-flex size-8 items-center justify-center rounded-lg">
                    <s.icon size={17} weight="fill" aria-hidden />
                  </span>
                  {s.name}
                  {current && <span className="ml-auto text-[12.5px] text-muted">Está acá</span>}
                </button>
              );
            })}
          </div>
        )}
      </Sheet>
    </>
  );
}

/** Búsqueda en vivo: el texto es local y la dirección lo sigue con un respiro. */
function SearchBox({ filters }: { filters: Filters }) {
  const router = useRouter();
  const [pending, startSearch] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [sent, setSent] = useState(filters.q);
  if (filters.q !== sent) {
    // Cambió desde afuera (otra sección, Atrás): el campo lo sigue.
    setSent(filters.q);
    setQ(filters.q);
  }
  const go = useRef((value: string) => {
    void value;
  });
  useEffect(() => {
    go.current = (value: string) => {
      setSent(value);
      startSearch(() => router.replace(hrefOf({ ...filters, q: value }), { scroll: false }));
    };
  });
  useEffect(() => {
    if (q.trim() === filters.q.trim()) return;
    const t = setTimeout(() => go.current(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q, filters.q]);
  return (
    <form
      role="search"
      action="/notas"
      onSubmit={(e) => {
        e.preventDefault();
        go.current(q.trim());
      }}
      className="relative"
    >
      {filters.section && <input type="hidden" name="seccion" value={filters.section} />}
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint">
        {pending ? <CircleNotch size={17} className="motion-safe:animate-spin" aria-hidden /> : <MagnifyingGlass size={17} aria-hidden />}
      </span>
      <input
        type="search"
        name="q"
        lang="es"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar en las notas"
        aria-label="Buscar en las notas"
        enterKeyHint="search"
        className={cx(inputClass, "rounded-full pr-10 pl-10")}
      />
      {q && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            go.current("");
          }}
          aria-label="Borrar la búsqueda"
          className="absolute top-1/2 right-1.5 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
        >
          <X size={15} />
        </button>
      )}
    </form>
  );
}

/** Fila de secciones con su conteo (se desliza de costado en el celular). */
function SectionPills({ filters, counts }: { filters: Filters; counts: Counts }) {
  // La píldora tocada se marca enseguida, sin esperar a que llegue la lista.
  const [clicked, setClicked] = useState<string | null>(null);
  const current = filters.section ?? "";
  const [from, setFrom] = useState(current);
  if (from !== current) {
    setFrom(current);
    setClicked(null);
  }
  const shown = clicked ?? current;
  // En el celular la fila se desliza: la sección abierta queda a la vista (sin animar, al llegar).
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const box = nav.current;
    const el = box?.querySelector<HTMLElement>("a[aria-current=page]");
    if (!box || !el || box.scrollWidth <= box.clientWidth) return;
    const left = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
    box.scrollLeft = Math.max(0, left);
  }, [current]);
  const items = [
    { id: "", name: "Todas", count: counts.all, icon: null, color: null },
    ...NOTE_SECTIONS.map((s) => ({ id: s.id as string, name: s.short ?? s.name, count: counts.bySection[s.id] ?? 0, icon: s.icon, color: s.color })),
  ];
  return (
    <nav ref={nav} aria-label="Secciones" className="relative -mx-4 min-w-0 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-1.5 pb-1 lg:w-auto lg:flex-wrap">
        {items.map((s) => {
          const on = shown === s.id;
          const Ico = s.icon;
          return (
            <li key={s.id || "todas"}>
              <Link
                href={hrefOf({ section: (s.id || null) as NoteSectionId | null, q: filters.q })}
                scroll={false}
                aria-current={on ? "page" : undefined}
                onClick={(e) => {
                  if (plainClick(e)) {
                    haptic("select");
                    setClicked(s.id);
                  }
                }}
                style={s.color ? tone(s.color) : undefined}
                className={cx(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] whitespace-nowrap transition-colors duration-[var(--dur-quick)]",
                  on ? "border-ink bg-ink font-medium text-on-ink" : "border-line-strong bg-surface/60 text-fg hover:bg-surface",
                )}
              >
                {Ico && <Ico size={15} weight={on ? "fill" : "regular"} className={on ? undefined : "text-tone-fg"} aria-hidden />}
                {s.name}
                <span className={cx("font-mono text-[11.5px] tabular", on ? "opacity-75" : "text-muted")}>{s.count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Empty({
  section,
  searching,
  later,
  onNew,
}: {
  section: ReturnType<typeof sectionOf> | null;
  searching: boolean;
  later: boolean;
  onNew: () => void;
}) {
  const Ico = section?.icon;
  const text = searching
    ? "No hay notas con eso. Probá con otra palabra o sacá el filtro."
    : later
      ? "No te queda ningún video por ver. Los que marques como vistos están en Todos."
      : section
        ? section.empty
        : "Acá va lo que antes te mandabas por WhatsApp: videos, links, ideas, compras, cursos, música y datos.";
  return (
    <div className="grid justify-items-center gap-3 rounded-[20px] border border-dashed border-line-strong px-6 py-12 text-center">
      {Ico ? (
        <span style={tone(section!.color)} className="chip-solid inline-flex size-12 items-center justify-center rounded-2xl">
          <Ico size={24} weight="fill" aria-hidden />
        </span>
      ) : (
        <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-fg">
          <NotePencil size={24} aria-hidden />
        </span>
      )}
      <p className="max-w-sm text-[14.5px] text-muted">{text}</p>
      {!searching && !later && (
        <Button variant="outline" size="sm" onClick={onNew}>
          <Plus size={15} weight="bold" /> {section ? `Agregar a ${section.name}` : "Nueva nota"}
        </Button>
      )}
    </div>
  );
}
