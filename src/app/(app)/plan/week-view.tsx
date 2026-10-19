"use client";

import { applyPendingBlocks } from "@/lib/offline/plan-pending";
import { usePendingActions } from "@/lib/offline/queue";
import { notifyDeleted, notifyError, notifyInfo } from "@/components/undo-toast";
import { showContextMenu } from "@/components/context-menu";
import { useSafeTransition } from "@/components/safe-action";
import { useOnNew } from "@/components/nav-add";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useMemo } from "react";
import { leaveThen, useKeepHeight, useNewIds, useTick } from "@/components/motion";
import { haptic } from "@/components/haptics";
import { useSwipe } from "@/components/swipe";
import { SwipeRow } from "@/components/swipe-row";
import { PillSwitch } from "@/components/pill-switch";
import { ArrowArcRight, ArrowRight, CaretLeft, CaretRight, Check, Clock, Copy, DotsThreeVertical, MapPin, Plus, CopySimple, NotePencil, PencilSimple, Trash, CalendarBlank } from "@phosphor-icons/react";
import { copyWeekToNext, moveBlock, passWeek, setBlockDone, deleteBlock, duplicateBlock, renameBlock, passToNextWeek, rescheduleBlock, scheduleTask, saveBlock } from "@/lib/offline/plan";
import { addDays, formatShort, startOfWeek, weekday } from "@/lib/dates";
import {
  isFreeBlock,
  sortBlocks,
  timeRange,
  WEEKDAY_LONG,
  type BlockDTO,
  type CategoryDTO,
  type TaskDTO,
  placeAt,
  type SortKeyPatch,
  PLAN_STEP_COOKIE,
  PLAN_VIEW_COOKIE,
  blockFromForm,
  newClientId,
  topSortKey,
  isBlockNow,
} from "@/lib/plan-logic";
import { PageHeader } from "@/components/page-header";
import { Button, cx, IconButton } from "@/components/ui";
import { Menu } from "@/components/menu";
import { Sortable, SortableItem } from "@/components/sortable";
import { BlockSheet, type BlockDraft, type BlockSheetActions, type BlockSheetHandle } from "./block-sheet";
import { CategoryTag, categoryMap, PriorityTag, useNow } from "./plan-ui";
import { PlanTabs } from "./plan-nav";
import { PlanWeekContext } from "./plan-context";
import { land, ringWhileMenu } from "./drag-motion";
import { BoardHours, BoardList } from "./week-board";

const SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Hacia dónde se tocó (flechas, "Hoy"): el próximo montaje desliza desde ese lado
// y lo consume. Entrar al Plan desde otro módulo no desliza (no es avanzar).
let pendingSlide: "plan-slide-next" | "plan-slide-prev" | null = null;
const markSlide = (dir: "next" | "prev") => {
  pendingSlide = dir === "next" ? "plan-slide-next" : "plan-slide-prev";
};
// El día que queda elegido al llegar a otros días (deslizar más allá del domingo o del lunes).
let pendingSelect: string | null = null;

/** Preferencias del Plan que lee el servidor al dibujar (un año, solo en /plan). */
function savePref(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/plan; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** ¿La tecla cae en algo que la usa (un campo, un grupo con flechas) o hay una hoja o un menú abierto? */
function shortcutBlocked(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return true;
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role=radiogroup], [role=tablist], [role=menu], [role=separator], [role=dialog], [role=grid], [role=slider]")) return true;
  return !!document.querySelector("dialog[open], div.fixed.min-w-52[role]");
}

/** Fin de un bloque de una hora que empieza a `start` (tope 23:59). */
function plusHour(start: string): string {
  const m = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + 60;
  return `${String(Math.min(23, Math.floor(m / 60))).padStart(2, "0")}:${String(m >= 24 * 60 ? 59 : m % 60).padStart(2, "0")}`;
}

export function WeekView({
  monday,
  start = monday,
  step: initialStep = "semana",
  today,
  blocks: initialBlocks,
  categories,
  tasks,
  top,
  todoFolded = false,
  initialView = "lista",
}: {
  /** Lista o Por horas, como quedó la última vez (cookie). */
  initialView?: "lista" | "horas";
  /** Lo que va arriba del calendario: las tareas. */
  top?: React.ReactNode;
  /** Pendientes sin hora plegados en la vista por horas (cookie). */
  todoFolded?: boolean;
  monday: string;
  /** Primer día que se ve (el lunes, o cualquier día si se avanza de a uno). */
  start?: string;
  /** Lo que avanzan las flechas: un día o una semana (cookie). */
  step?: "dia" | "semana";
  today: string;
  blocks: BlockDTO[];
  categories: CategoryDTO[];
  tasks: Pick<TaskDTO, "id" | "title" | "status" | "categoryId" | "priority">[];
}) {
  const router = useRouter();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const isThisWeek = days.includes(today);
  const [selected, setSelected] = useState(() => (pendingSelect && days.includes(pendingSelect) ? pendingSelect : isThisWeek ? today : start));
  // Hacia dónde se movió: adelante desliza desde la derecha, atrás desde la izquierda.
  const [slide] = useState(() => pendingSlide ?? "");
  useEffect(() => {
    pendingSlide = null;
    pendingSelect = null;
  }, []);
  // Minuto de ahora (cada minuto): la línea de Por horas y el bloque que está pasando.
  const now = useNow();
  // Elegir otro día en la tira del celular: la lista entra desde ese lado.
  const [daySlide, setDaySlide] = useState("");
  // Un día con menos bloques no achica la página (ver useKeepHeight).
  const [keepRef, keepStyle, keepHeight] = useKeepHeight<HTMLDivElement>();
  const pickDay = (d: string) => {
    if (d === selected) return;
    keepHeight();
    setDaySlide(d > selected ? "plan-slide-next" : "plan-slide-prev");
    setSelected(d);
  };
  // Lista ↔ Por horas: fundido corto (solo después de tocar, no al cargar).
  const [viewSwap, setViewSwap] = useState(false);
  const [step, setStepState] = useState<"dia" | "semana">(initialStep);
  const setStep = (s: "dia" | "semana") => {
    setStepState(s);
    savePref(PLAN_STEP_COOKIE, s);
  };
  // Cambios optimistas: tildar, mover, guardar la hoja, agendar una tarea.
  // Lo hecho sin conexión (todavía sin subir) ya se ve.
  const pendingOps = usePendingActions();
  const withPending = useMemo(() => applyPendingBlocks(initialBlocks, pendingOps), [initialBlocks, pendingOps]);
  // Un cambio (`{ id, ...campos }`) o un bloque nuevo (`{ add }`: provisorio hasta que llega
  // el del servidor, que tiene el mismo id, así no se vuelve a montar).
  const [blocks, applyDone] = useOptimistic(withPending, (state, m: (Partial<BlockDTO> & { id: string }) | { add: BlockDTO }) =>
    "add" in m
      ? state.some((b) => b.id === m.add.id)
        ? state.map((b) => (b.id === m.add.id ? m.add : b))
        : [...state, m.add]
      : state.map((b) => (b.id === m.id ? { ...b, ...m } : b)),
  );
  const [view, setViewState] = useState<"lista" | "horas">(initialView);
  // La vista elegida se recuerda (al recargar o cambiar de semana sigue igual).
  // Cada vez que se elige Por horas tocando el selector (en el celular la página va a la hora de ahora).
  const [hoursSeq, setHoursSeq] = useState(0);
  const setView = (v: "lista" | "horas") => {
    setViewSwap(true);
    setViewState(v);
    if (v === "horas") setHoursSeq((x) => x + 1);
    savePref(PLAN_VIEW_COOKIE, v);
  };
  const [, startTransition] = useSafeTransition();
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const sheet = useRef<BlockSheetHandle>(null);
  // Lo que se presta a las tareas de arriba (estable: si no, se volverían a dibujar con cada cambio de la semana).
  const weekCtx = useMemo(() => ({ openBlock: (d: BlockDraft) => sheet.current?.open(d) }), []);
  const cats = categoryMap(categories);

  const byDay = new Map(days.map((d) => [d, sortBlocks(blocks.filter((b) => b.date === d))]));
  // Solo lo que está en los días que se ven (un bloque recién pasado a otra semana deja de contar enseguida).
  const work = blocks.filter((b) => !isFreeBlock(b) && days.includes(b.date));
  const doneCount = work.filter((b) => b.done).length;
  // "N de M hechos": al tildar, el número cambia con un corrimiento corto (al cargar, nada).
  const doneTick = useTick(doneCount);

  function toggle(b: BlockDTO) {
    // Terminar el último que faltaba del día: el pulso largo (como "Día completo" en Hábitos).
    if (!b.done && !isFreeBlock(b)) {
      const rest = blocks.filter((x) => x.date === b.date && x.id !== b.id && !isFreeBlock(x));
      if (rest.every((x) => x.done)) haptic("complete");
    }
    startTransition(async () => {
      applyDone({ id: b.id, done: !b.done });
      await setBlockDone(b.id, !b.done);
    });
  }
  const openNew = (date: string, startTime?: string) => sheet.current?.open(startTime ? { date, startTime } : { date });

  /**
   * La hoja guarda al instante: se cierra enseguida y el bloque ya se ve cambiado o
   * nuevo (con el id que le pone el aparato, el mismo que va a tener guardado). Si
   * el servidor dice que no, vuelve solo y avisa abajo.
   */
  const sheetActions: BlockSheetActions = {
    save(fd: FormData, draft: BlockDraft) {
      const isNew = !draft.id;
      const id = draft.id ?? newClientId();
      if (isNew) fd.set("clientId", id);
      const base = draft.id ? (blocks.find((x) => x.id === draft.id) ?? null) : null;
      const next = blockFromForm(fd, base, blocks, id);
      startTransition(async () => {
        if (next) applyDone(isNew ? { add: next } : next);
        const r = await saveBlock(null, fd);
        if (r && !r.ok) notifyError(`No se guardó: ${r.error}`);
      });
    },
    duplicate(id) {
      const b = blocks.find((x) => x.id === id);
      const copyId = newClientId();
      startTransition(async () => {
        if (b) applyDone({ add: { ...b, id: copyId, done: false, sortKey: b.startTime ? null : (b.sortKey ?? -1) + 0.01 } });
        await duplicateBlock(id, copyId);
      });
    },
    passWeek(id) {
      const b = blocks.find((x) => x.id === id);
      startTransition(async () => {
        if (b) applyDone({ id, date: addDays(b.date, 7), done: false });
        await passToNextWeek(id);
      });
    },
    remove(id) {
      // Se va con una salida corta y recién después se saca de la semana.
      leaveThen(`[data-leave="${id}"]`, () =>
        startTransition(async () => {
          applyDone({ id, date: "" });
          await deleteBlock(id);
        }),
      );
    },
  };

  // `others`: vecinos sin hora que se renumeran cuando no había lugar entre ellos (`placeAt`).
  function move(id: string, date: string, startTime?: string | null, sortKey?: number, others?: SortKeyPatch[]) {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    const sameSpot = b.date === date && (startTime === undefined || startTime === b.startTime);
    if (sameSpot && (sortKey === undefined || sortKey === b.sortKey) && !others?.length) return;
    // Lo optimista sigue las reglas del servidor: a otra hora conserva la duración y
    // a una semana posterior llega sin tildar.
    const later = startOfWeek(date) > startOfWeek(b.date);
    let endTime = b.endTime;
    if (startTime === null) endTime = null;
    else if (startTime && b.startTime && b.endTime) {
      const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      const e = Math.min(23 * 60 + 59, m(startTime) + m(b.endTime) - m(b.startTime));
      endTime = e > m(startTime) ? `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}` : null;
    }
    startTransition(async () => {
      applyDone({ id, date, endTime, ...(later ? { done: false } : {}), ...(startTime !== undefined ? { startTime } : {}), ...(sortKey !== undefined ? { sortKey } : {}) });
      for (const [oid, key] of others ?? []) applyDone({ id: oid, sortKey: key });
      // La hora va siempre explícita: sin señal la llamada se guarda como JSON y un
      // `undefined` ("no cambia") volvía como `null` ("sin hora") y le borraba la hora.
      await moveBlock(id, date, startTime === undefined ? b.startTime : startTime, sortKey, others?.length ? others : undefined);
    });
  }
  const openEdit = (b: BlockDTO) => sheet.current?.open(b);
  // Clic derecho en un bloque: cambiar el nombre ahí mismo, duplicar, editar o borrar.
  // La tarjeta queda con un aro de acento mientras el menú está abierto.
  function blockMenu(e: React.MouseEvent, b: BlockDTO) {
    const host = e.currentTarget as HTMLElement;
    ringWhileMenu(host.querySelector<HTMLElement>("[data-ring]") ?? host);
    showContextMenu(
      e,
      [
        {
          label: "Cambiar nombre",
          icon: <PencilSimple size={15} />,
          rename: {
            value: b.title,
            onSave: (title) =>
              startTransition(async () => {
                applyDone({ id: b.id, title });
                await renameBlock(b.id, title);
              }),
          },
        },
        {
          label: "Cambiar fecha y hora",
          icon: <CalendarBlank size={15} />,
          schedule: {
            date: b.date,
            start: b.startTime,
            end: b.endTime,
            onSave: (date, start, end) =>
              startTransition(async () => {
                // Como el servidor: solo destilda si va a una semana posterior (otro día de la misma semana conserva el hecho).
                applyDone({ id: b.id, date, startTime: start, endTime: end, ...(startOfWeek(date) > startOfWeek(b.date) ? { done: false } : {}) });
                await rescheduleBlock(b.id, date, start, end);
              }),
          },
        },
        {
          label: "Pasar a la semana que viene",
          icon: <ArrowArcRight size={15} />,
          onSelect: () => sheetActions.passWeek(b.id),
        },
        { label: "Duplicar", icon: <CopySimple size={15} />, onSelect: () => sheetActions.duplicate(b.id) },
        { label: "Editar", icon: <NotePencil size={15} />, onSelect: () => openEdit(b) },
        {
          label: "Borrar",
          icon: <Trash size={15} />,
          danger: true,
          onSelect: () => {
            sheetActions.remove(b.id);
            notifyDeleted("Bloque borrado");
          },
        },
      ],
      b.title,
    );
  }
  /** Deslizar un bloque hacia la izquierda en el celular: mañana, a la misma hora. */
  function toTomorrow(b: BlockDTO) {
    const date = addDays(b.date, 1);
    startTransition(async () => {
      // Si pasa a la semana que viene, llega sin tildar (como en el servidor).
      applyDone({ id: b.id, date, ...(startOfWeek(date) > startOfWeek(b.date) ? { done: false } : {}) });
      await rescheduleBlock(b.id, date, b.startTime, b.endTime);
    });
    notifyInfo(`"${b.title}" pasó a mañana`);
  }

  useOnNew(() => openNew(selected));
  // Una tarea soltada en un día: se agenda. El bloque se ve al instante (con el nombre,
  // la categoría y la prioridad de la tarea) y llega con un viaje corto desde donde se soltó.
  function dropTask(taskId: string, date: string, startTime: string | null, sortKey?: number, others?: SortKeyPatch[], at?: { clientX: number; clientY: number }) {
    const t = tasks.find((x) => x.id === taskId);
    const id = newClientId();
    haptic("success");
    if (at) land(id, at);
    startTransition(async () => {
      for (const [oid, key] of others ?? []) applyDone({ id: oid, sortKey: key });
      if (t) {
        applyDone({
          add: {
            id,
            title: t.title,
            categoryId: t.categoryId,
            priority: t.priority,
            taskId,
            date,
            startTime,
            endTime: startTime ? plusHour(startTime) : null,
            sortKey: startTime ? null : (sortKey ?? topSortKey(blocks.filter((b) => b.date === date))),
            done: false,
            place: null,
            notes: null,
          },
        });
      }
      await scheduleTask(taskId, date, startTime, sortKey, others?.length ? others : undefined, id);
      notifyInfo("Tarea agendada");
    });
  }
  const boardProps = { days, today, now, byDay, cats, onToggle: toggle, onEdit: openEdit, onNew: openNew, onMove: move, onMenu: blockMenu, onDropTask: dropTask };

  // Las flechas avanzan un día o una semana. Si se ve de lunes a domingo, la dirección
  // sigue siendo ?semana=; si no, ?desde= (siete días corridos desde ese día).
  const hrefFrom = (d: string) => (step === "semana" && d === startOfWeek(d) ? `/plan?semana=${d}` : `/plan?desde=${d}`);
  const n = step === "dia" ? 1 : 7;
  const prev = hrefFrom(addDays(start, -n));
  const next = hrefFrom(addDays(start, n));
  const unit = step === "dia" ? "Día" : "Semana";
  const todayHref = step === "dia" ? `/plan?desde=${today}` : "/plan";
  // Lo de antes y lo de después ya quedan pedidos: las flechas no esperan.
  useEffect(() => {
    router.prefetch(prev);
    router.prefetch(next);
  }, [router, prev, next]);
  /** Avanzar sin volver arriba de todo: la semana nueva entra deslizándose donde se está mirando. */
  function go(href: string, dir: "next" | "prev") {
    markSlide(dir);
    router.push(href, { scroll: false });
  }
  /** Otro día (deslizar sobre la lista): si se sale de los siete que se ven, va a esos días. */
  function shiftDay(delta: 1 | -1) {
    const target = addDays(selected, delta);
    if (days.includes(target)) return pickDay(target);
    pendingSelect = target;
    go(hrefFrom(addDays(start, delta * n)), delta > 0 ? "next" : "prev");
  }
  const listSwipe = useSwipe({ onLeft: () => shiftDay(1), onRight: () => shiftDay(-1) });
  // Sobre la tira de días, deslizar cambia de semana (y queda elegido el mismo día de la semana).
  const stripSwipe = useSwipe({
    onLeft: () => {
      pendingSelect = addDays(selected, 7);
      go(hrefFrom(addDays(start, 7)), "next");
    },
    onRight: () => {
      pendingSelect = addDays(selected, -7);
      go(hrefFrom(addDays(start, -7)), "prev");
    },
  });

  // Teclado (compu): ← → avanzan como las flechas, T vuelve a hoy, N abre un bloque nuevo.
  const keys = useRef({ prev, next, todayHref, isThisWeek, start, today, selected });
  useEffect(() => {
    keys.current = { prev, next, todayHref, isThisWeek, start, today, selected };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutBlocked(e)) return;
      const k = keys.current;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        haptic("select");
        const back = e.key === "ArrowLeft";
        markSlide(back ? "prev" : "next");
        router.push(back ? k.prev : k.next, { scroll: false });
      } else if (e.key === "t" || e.key === "T") {
        if (k.isThisWeek) return;
        e.preventDefault();
        haptic("select");
        markSlide(k.today > k.start ? "next" : "prev");
        router.push(k.todayHref, { scroll: false });
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        haptic("select");
        sheet.current?.open({ date: k.selected });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <PlanWeekContext value={weekCtx}>
      {/* El encabezado llega al mismo ancho que la semana (a 1920 px quedaban corridos). */}
      <div className="plan-head contents">
        <PageHeader
          title="Plan semanal"
          wide
          tabs={<PlanTabs />}
          actions={
            <>
              <Menu
                trigger={(toggleMenu) => (
                  <IconButton label="Más opciones" onClick={toggleMenu}>
                    <DotsThreeVertical size={20} weight="bold" />
                  </IconButton>
                )}
                items={[
                  {
                    // La misma tarjeta pasa a la semana siguiente (no se duplica).
                    label: "Pasar toda la semana a la siguiente",
                    icon: <ArrowArcRight size={16} />,
                    onSelect: () =>
                      startTransition(async () => {
                        const r = await passWeek(monday);
                        setCopyMsg(
                          r.ok
                            ? `Listo: ${r.count} ${r.count === 1 ? "tarjeta pasó" : "tarjetas pasaron"} a la semana que viene, sin tildar. Ajustá las que cambien de día.`
                            : r.error,
                        );
                      }),
                  },
                  {
                    label: "Copiar a la semana que viene",
                    icon: <Copy size={16} />,
                    onSelect: () =>
                      startTransition(async () => {
                        const r = await copyWeekToNext(monday);
                        setCopyMsg(r.ok ? "Listo: la semana que viene ya tiene estos bloques." : r.error);
                      }),
                  },
                ]}
              />
              <Button variant="accent" size="sm" className="ml-1 max-lg:hidden" title="Atajo: N" onClick={() => openNew(selected)}>
                <Plus size={16} weight="bold" /> Nuevo bloque
              </Button>
            </>
          }
        />
      </div>

      <main className="mx-auto max-w-6xl px-4 lg:max-w-[110rem] lg:px-10">
        {top}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 lg:pt-5">
          <div className="flex items-center gap-1">
            <Link
              href={prev}
              scroll={false}
              onClick={() => markSlide("prev")}
              aria-label={`${unit} anterior`}
              title={`${unit} anterior (←)`}
              className="inline-flex size-11 items-center justify-center rounded-full text-fg hover:bg-surface-2"
            >
              <CaretLeft size={18} />
            </Link>
            <h2 className="overflow-hidden text-center">
              <span key={start} className={cx("display inline-block min-w-40 text-[21px]", slide)}>
                {formatShort(days[0])} al {formatShort(days[6])}
              </span>
            </h2>
            <Link
              href={next}
              scroll={false}
              onClick={() => markSlide("next")}
              aria-label={`${unit} siguiente`}
              title={`${unit} siguiente (→)`}
              className="inline-flex size-11 items-center justify-center rounded-full text-fg hover:bg-surface-2"
            >
              <CaretRight size={18} />
            </Link>
          </div>
          {/* Qué avanzan las flechas (se recuerda). */}
          <PillSwitch
            label="Las flechas avanzan"
            value={step}
            options={[
              { value: "dia", label: "Día" },
              { value: "semana", label: "Semana" },
            ]}
            onChange={setStep}
          />
          {!isThisWeek && (
            <Link
              href={todayHref}
              scroll={false}
              title="Atajo: T"
              onClick={() => markSlide(today > start ? "next" : "prev")}
              className="inline-flex min-h-11 items-center text-sm font-medium text-accent-fg hover:underline"
            >
              {step === "dia" ? "Hoy" : "Esta semana"}
            </Link>
          )}
          {work.length > 0 && (
            <p className="kicker tabular ml-auto">
              <span key={doneTick.key} className={doneTick.className}>
                {doneCount}
              </span>{" "}
              de {work.length} hechos
            </p>
          )}
        </div>
        {copyMsg && (
          <p role="status" className="reveal mb-3 border-l-[1.5px] border-accent py-1 pl-3 text-[14px] text-accent-fg">
            {copyMsg}{" "}
            {copyMsg.startsWith("Listo") && (
              <Link href={`/plan?semana=${addDays(monday, 7)}`} className="font-medium underline underline-offset-4">
                Ir a esa semana
              </Link>
            )}
          </p>
        )}

        {/* Celular: tira de días + lista del día elegido */}
        <div className="lg:hidden">
          {/* Deslizar sobre la tira cambia de semana. */}
          <div {...stripSwipe} className={cx("mb-5 grid grid-cols-7 gap-1 border-y border-line py-2", slide)} role="tablist" aria-label="Días">
            {days.map((d) => {
              const active = d === selected;
              const count = byDay.get(d)!.filter((b) => !isFreeBlock(b)).length;
              const pending = byDay.get(d)!.some((b) => !b.done && !isFreeBlock(b));
              return (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => pickDay(d)}
                  className={cx(
                    "tap-tint relative flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-[6px] transition-colors",
                    active ? "bg-ink text-on-ink" : "text-fg hover:bg-surface-2",
                    // El día recién elegido acusa el toque (solo después de tocar, no al cargar).
                    active && daySlide && "plan-pick",
                  )}
                >
                  <span className={cx("font-mono text-[10px] font-medium tracking-[0.08em] uppercase", active ? "text-on-ink" : "text-muted")}>{SHORT[weekday(d)]}</span>
                  <span className="figure text-[21px]">{Number(d.slice(8))}</span>
                  <span
                    className={cx(
                      "mt-0.5 h-1.5 w-1.5 rounded-full",
                      count === 0 ? "bg-transparent" : pending ? (active ? "bg-on-ink" : "bg-accent") : active ? "bg-on-ink/50" : "bg-faint",
                    )}
                    aria-hidden
                  />
                  {d === today && !active && <span className="absolute inset-x-3 top-0 h-[2px] rounded-b-full bg-accent" aria-hidden />}
                </button>
              );
            })}
          </div>
          <div className="mb-3 flex justify-end">
            <ViewToggle view={view} onChange={setView} />
          </div>
          {/* Deslizar de costado sobre la lista cambia de día (como tocar otro en la tira). */}
          <div {...listSwipe} key={`${view}-${selected}`} ref={keepRef} style={keepStyle} className={daySlide || slide || (viewSwap ? "swap" : undefined)}>
            {view === "lista" ? (
              <DayList
                day={selected}
                today={today}
                now={now}
                blocks={byDay.get(selected)!}
                cats={cats}
                onToggle={toggle}
                onEdit={openEdit}
                onNew={() => openNew(selected)}
                onMove={move}
                onTomorrow={toTomorrow}
              />
            ) : (
              // Por horas en el celular: el calendario del día elegido en la tira.
              <BoardHours {...boardProps} days={[selected]} todoFolded={todoFolded} openSeq={hoursSeq} />
            )}
          </div>
        </div>

        {/* Escritorio: lista de 7 columnas o calendario por horas; los bloques se arrastran. */}
        <div className="hidden lg:block">
          <div className="mb-3 flex justify-end">
            <ViewToggle view={view} onChange={setView} />
          </div>
          <div key={view} className={slide || (viewSwap ? "swap" : undefined)}>
            {view === "lista" ? <BoardList {...boardProps} /> : <BoardHours {...boardProps} todoFolded={todoFolded} />}
          </div>
        </div>
      </main>

      <BlockSheet ref={sheet} categories={categories} tasks={tasks} actions={sheetActions} />
    </PlanWeekContext>
  );
}

function DayList({
  day,
  today,
  now,
  blocks,
  cats,
  onToggle,
  onEdit,
  onNew,
  onMove,
  onTomorrow,
}: {
  day: string;
  today: string;
  now: number;
  blocks: BlockDTO[];
  cats: Map<string, CategoryDTO>;
  onToggle: (b: BlockDTO) => void;
  onEdit: (b: BlockDTO) => void;
  onNew: () => void;
  onMove: (id: string, date: string, startTime?: string | null, sortKey?: number, others?: SortKeyPatch[]) => void;
  onTomorrow: (b: BlockDTO) => void;
}) {
  // Mantener apretado un bloque sin hora y moverlo: queda en ese lugar del día
  // (entre los vecinos, como en la columna de la compu). Los que tienen hora van por horario.
  // Un bloque recién creado, movido o restaurado entra con un fundido (no al cargar).
  const fresh = useNewIds(blocks.map((b) => b.id));
  // Deslizar la fila (atajo) y mantener apretado para ordenar no se pelean: si el dedo
  // se quedó quieto ~0,25 s, es para ordenar y la fila ya no se desliza.
  const [held, setHeld] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const holdStart = useRef<{ x: number; y: number } | null>(null);
  const holdProps = (id: string) => ({
    onTouchStartCapture: (e: React.TouchEvent) => {
      const t = e.touches[0];
      holdStart.current = { x: t.clientX, y: t.clientY };
      clearTimeout(holdTimer.current);
      holdTimer.current = setTimeout(() => setHeld(id), 250);
    },
    onTouchMoveCapture: (e: React.TouchEvent) => {
      const s = holdStart.current;
      const t = e.touches[0];
      if (s && Math.hypot(t.clientX - s.x, t.clientY - s.y) > 8) clearTimeout(holdTimer.current);
    },
    onTouchEndCapture: () => {
      clearTimeout(holdTimer.current);
      setHeld(null);
    },
    onTouchCancelCapture: () => {
      clearTimeout(holdTimer.current);
      setHeld(null);
    },
  });
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  function reorder(_ids: string[], moved: { id: string; to: number }) {
    const b = blocks.find((x) => x.id === moved.id);
    if (!b || b.startTime) return;
    const rest = blocks.filter((x) => x.id !== moved.id);
    const { key, others } = placeAt(rest, moved.to);
    haptic("success");
    onMove(b.id, day, undefined, key, others);
  }
  return (
    <section aria-label={WEEKDAY_LONG[weekday(day)]}>
      <h3 className="display pb-3 text-[24px] first-letter:uppercase">
        {day === today ? "Hoy, " : ""}
        {WEEKDAY_LONG[weekday(day)].toLowerCase()} {Number(day.slice(8))}
      </h3>
      {blocks.length === 0 ? (
        <div className="grid justify-items-start gap-3 border-t border-line py-8">
          <p className="display text-[20px] text-muted">Nada planeado para este día.</p>
          <Button variant="outline" size="sm" onClick={onNew}>
            <Plus size={15} /> Agregar bloque
          </Button>
        </div>
      ) : (
        <Sortable ids={blocks.map((b) => b.id)} onReorder={reorder}>
          <ol className="grid border-t border-line">
            {blocks.map((b) => {
              const live = isBlockNow(b, today, now);
              return (
                <SortableItem
                  key={b.id}
                  id={b.id}
                  disabled={!!b.startTime}
                  className={cx("border-b border-line bg-bg", fresh.has(b.id) && "reveal")}
                  draggingClass="rounded-xl shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)]"
                >
                  {/* Deslizar: a la derecha "Hecho" (un "Libre" no se tilda), a la izquierda "Mañana". */}
                  <SwipeRow
                    left={held === b.id || isFreeBlock(b) || b.done ? undefined : { label: "Hecho", icon: <Check size={20} weight="bold" />, tone: "done", onAction: () => onToggle(b) }}
                    right={held === b.id ? undefined : { label: "Mañana", icon: <ArrowRight size={20} weight="bold" />, tone: "accent", onAction: () => onTomorrow(b) }}
                  >
                    <div {...holdProps(b.id)} className={cx("tap-tint grid grid-cols-[60px_1fr] items-start gap-3 bg-bg", isFreeBlock(b) && "free-row")}>
                      <span className={cx("pt-3 text-right font-mono text-[13px] leading-tight font-medium tabular", live ? "text-accent-fg" : "text-fg/80")}>
                        {b.startTime ? (
                          <span className="inline-flex items-center justify-end gap-1.5">
                            {/* Está pasando ahora: punto de acento (cambia solo, cada minuto). */}
                            {live && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
                            {b.startTime.replace(/^0/, "")}
                          </span>
                        ) : (
                          <span className="font-sans text-[11.5px] font-normal whitespace-nowrap text-muted">Todo el día</span>
                        )}
                        {b.endTime && <span className="block font-normal text-muted">{b.endTime.replace(/^0/, "")}</span>}
                        {live && <span className="sr-only">, ahora</span>}
                      </span>
                      <BlockCard block={b} category={b.categoryId ? cats.get(b.categoryId) : null} onToggle={() => onToggle(b)} onEdit={() => onEdit(b)} />
                    </div>
                  </SwipeRow>
                </SortableItem>
              );
            })}
          </ol>
        </Sortable>
      )}
    </section>
  );
}

export function BlockCard({
  block: b,
  category,
  onToggle,
  onEdit,
  compact,
  live,
}: {
  block: BlockDTO;
  category?: CategoryDTO | null;
  onToggle: () => void;
  onEdit: () => void;
  compact?: boolean;
  /** Está pasando ahora (hoy, entre su inicio y su fin): aro de acento. */
  live?: boolean;
}) {
  const free = isFreeBlock(b);
  const range = timeRange(b);
  // La tilde aparece con un golpe corto, solo después de tocarla (no al cargar).
  const [tapped, setTapped] = useState(false);
  return (
    <article
      data-leave={b.id}
      data-ring
      className={cx(
        "group relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1.5 transition-colors",
        // En la columna de la compu cada bloque es una tarjeta (bien separada de la siguiente).
        // Con el mouse sube 1 px (pista de que se puede agarrar y arrastrar).
        compact ? "lift plan-hover tap-tint rounded-xl border border-line bg-surface px-2.5 py-2.5" : "py-2.5 pr-1",
        // "Libre": la misma tarjeta, teñida de verde suave.
        compact && free && "free-block",
        compact && live && "plan-live",
      )}
    >
      {/* En la columna de la compu el título va a todo el ancho (la casilla baja a la
          fila de las etiquetas), así las palabras largas no se parten. */}
      <button type="button" onClick={onEdit} className={cx("min-w-0 text-left", (free || compact) && "col-span-2")}>
        <span
          className={cx(
            "block leading-snug font-medium break-words hyphens-auto",
            // En la columna de la compu, un poco más chico hasta las pantallas grandes: así
            // entran palabras largas ("Emprendimientos") sin partirse.
            compact ? "text-[13.5px] tracking-[-0.01em] 2xl:text-[14.5px] 2xl:tracking-normal" : "text-[14.5px]",
            free && "font-normal",
            b.done && !free && "text-muted line-through decoration-faint",
          )}
        >
          {b.title}
        </span>
        {/* La hora, cerca del título y con peso parecido al de las etiquetas. */}
        {compact && range && (
          <span className={cx("mt-1 flex items-center gap-1 font-mono text-[12px] font-medium whitespace-nowrap tabular 2xl:text-[13px]", live ? "text-accent-fg" : "text-fg/75")}>
            <Clock size={13} weight="bold" aria-hidden className={cx("shrink-0", live ? "text-accent-fg" : "text-muted")} />
            {range.replace(" a ", "–")}
            {live && <span className="sr-only">, está pasando ahora</span>}
          </span>
        )}
      </button>
      {(() => {
        const check = !free && (
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              setTapped(true);
              onToggle();
            }}
            aria-pressed={b.done}
            aria-label={b.done ? `${b.title}: hecho. Desmarcar` : `Marcar ${b.title} como hecho`}
            className={cx(
              "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-[transform,background-color] active:scale-90",
              compact ? "-my-1.5 -mr-1.5 size-9" : "row-span-2",
            )}
          >
            <span
              className={cx(
                "inline-flex size-[22px] items-center justify-center rounded-[4px] border-[1.5px] transition-colors",
                b.done ? "border-[var(--st-done-line)] bg-[var(--st-done-line)] text-on-accent" : "border-fg/45 bg-transparent group-hover:border-fg/70",
              )}
            >
              {b.done && <Check size={14} weight="bold" className={tapped ? "mark-pop" : undefined} />}
            </span>
          </button>
        );
        const place = b.place && (
          <span className="inline-flex items-center gap-1 text-[12px] text-muted">
            <MapPin size={12} aria-hidden /> {b.place}
          </span>
        );
        // Columna de la compu: título y hora a todo el ancho, la etiqueta debajo y,
        // en la última fila, la prioridad con la casilla a la derecha (nada se pisa
        // aunque la columna sea angosta).
        if (compact)
          return (
            <>
              <button type="button" onClick={onEdit} tabIndex={-1} className="col-span-2 grid min-w-0 justify-items-start gap-1.5 text-left">
                <CategoryTag category={category} />
                {place}
              </button>
              <div className="col-span-2 flex min-h-7 items-center justify-between gap-2">
                <button type="button" onClick={onEdit} tabIndex={-1} className="min-w-0 text-left">
                  <PriorityTag n={b.priority} />
                </button>
                {check}
              </div>
            </>
          );
        return (
          <>
            {check}
            <button type="button" onClick={onEdit} tabIndex={-1} className="col-start-1 grid min-w-0 gap-1.5 text-left">
              <span className="flex flex-wrap items-center gap-1.5">
                <CategoryTag category={category} />
                <PriorityTag n={b.priority} />
              </span>
              {place}
            </button>
          </>
        );
      })()}
    </article>
  );
}

/** Lista o Por horas (en el celular y en la compu). */
function ViewToggle({ view, onChange }: { view: "lista" | "horas"; onChange: (v: "lista" | "horas") => void }) {
  return (
    <PillSwitch
      label="Vista"
      value={view}
      options={[
        { value: "lista", label: "Lista" },
        { value: "horas", label: "Por horas" },
      ]}
      onChange={onChange}
      item="h-8 px-3.5 text-[12.5px]"
    />
  );
}
