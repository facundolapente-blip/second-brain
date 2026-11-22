"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  CaretDown,
  Check,
  CheckCircle,
  Circle,
  CalendarBlank,
  Fire,
  Lightning,
  Target,
  ClockCounterClockwise,
  GearSix,
  MagnifyingGlass,
  NotePencil,
  Pause,
  Play,
  Stop,
  Timer,
  Trash,
  X,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { StatTile, TintedCard } from "@/components/tinted-card";
import { PillSwitch } from "@/components/pill-switch";
import { Button, cx, Field, IconButton, Input, inputClass, Sheet, type SheetHandle } from "@/components/ui";
import { quiet, useSafeTransition } from "@/components/safe-action";
import { notifyDeleted, notifyError, notifyInfo } from "@/components/undo-toast";
import { showContextMenu } from "@/components/context-menu";
import { useHoldMenu } from "@/components/hold-menu";
import { haptic } from "@/components/haptics";
import { addDays, formatRelative, weekdayInitial } from "@/lib/dates";
import {
  clockText,
  cyclePosition,
  FOCUS_LIMITS,
  FOCUS_MODES,
  groupByDay,
  hourText,
  MIN_SAVE_MS,
  minutesShort,
  minutesText,
  MODE_LABEL,
  normalizeFocusSettings,
  rangeText,
  sessionsText,
  totalsOf,
  weekMinutes,
  breakAfter,
  focusStats,
  type FocusMode,
  type FocusSettings,
} from "@/lib/focus-logic";
import {
  afterEnded,
  discardEnded,
  finish,
  reset,
  sessionsDone,
  setLink,
  setMode,
  startLinked,
  syncSettings,
  syncPush,
  setPush,
  toggle,
  useFocusTimer,
  useRemaining,
  type FocusLink,
  type FocusTimerState,
} from "@/lib/focus-timer";
import { deleteFocusSession, saveFocusPush, saveFocusSession, saveFocusSettings, updateFocusNote } from "@/lib/offline/focus";
import { Switch } from "../avisos/reminder-rows";
import { toggleSubtask } from "@/lib/offline/plan";
import type { FocusPageData, FocusSessionDTO, FocusTarget } from "@/lib/focus";

type Op = { type: "add"; session: FocusSessionDTO } | { type: "remove"; id: string } | { type: "note"; id: string; note: string | null };

function reduce(list: FocusSessionDTO[], op: Op): FocusSessionDTO[] {
  if (op.type === "add") return [op.session, ...list];
  if (op.type === "remove") return list.filter((s) => s.id !== op.id);
  return list.map((s) => (s.id === op.id ? { ...s, note: op.note } : s));
}

/** Redondeo para el SVG: el servidor y el navegador no dan los mismos decimales de seno y coseno. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function EnfoqueView({ data, link }: { data: FocusPageData; link: FocusLink | null }) {
  const router = useRouter();
  const t = useFocusTimer();
  const [sessions, patch] = useOptimistic(data.sessions, reduce);
  const [, run] = useSafeTransition();

  // Los tiempos guardados mandan sobre los del aparato.
  useEffect(() => {
    syncSettings(data.settings);
  }, [data.settings]);
  useEffect(() => {
    syncPush(data.push);
  }, [data.push]);

  // Desde el Plan (`?tarea=` o `?bloque=`): liga y arranca, y saca el parámetro (si no, recargar volvería a arrancar).
  const linked = useRef(false);
  useEffect(() => {
    if (!link || linked.current) return;
    linked.current = true;
    startLinked(link);
    haptic("tap");
    router.replace("/enfoque", { scroll: false });
  }, [link, router]);

  // La hoja de "Sesión terminada" se abre sola una vez por sesión terminada (también al llegar desde la píldora).
  const endSheet = useRef<SheetHandle>(null);
  const endedKey = t.status === "ended" ? (t.ended?.endedAt ?? null) : null;
  const shownFor = useRef<number | null>(null);
  useEffect(() => {
    if (endedKey && shownFor.current !== endedKey) {
      shownFor.current = endedKey;
      endSheet.current?.open();
    }
  }, [endedKey]);

  const today = data.today;
  const todayTotals = totalsOf(sessions.filter((s) => s.day === today));
  const weekTotals = totalsOf(sessions.filter((s) => s.day >= data.monday && s.day <= addDays(data.monday, 6)));
  const stats = focusStats(sessions, today, data.monday, data.days);

  function saveEnded(note: string, then: "break" | "focus") {
    const e = t.ended;
    if (!e) return;
    endSheet.current?.close();
    afterEnded(then);
    const input = { startedAt: e.startedAt, endedAt: e.endedAt, minutes: e.minutes, note, taskId: e.link?.taskId ?? null, blockId: e.link?.blockId ?? null, title: e.link?.title ?? null };
    const temp: FocusSessionDTO = {
      id: `nueva-${e.endedAt}`,
      day: today,
      startedAt: new Date(e.startedAt).toISOString(),
      endedAt: new Date(e.endedAt).toISOString(),
      minutes: e.minutes,
      note: note.trim() || null,
      taskId: input.taskId,
      blockId: input.blockId,
      title: input.title,
    };
    haptic("success");
    run(async () => {
      patch({ type: "add", session: temp });
      const r = await saveFocusSession(input);
      if (r && "error" in r) notifyError(r.error);
    });
  }

  return (
    <>
      <PageHeader title="Enfoque" kicker="Una cosa a la vez" wide />
      <main className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-4 px-4 pt-2 pb-16 lg:gap-5 lg:px-10 lg:pt-4">
        <TimerCard
          t={t}
          targets={data.targets}
          meta={todayTotals.count ? `Hoy ${minutesText(todayTotals.minutes)} · ${sessionsText(todayTotals.count)}` : "Hoy todavía nada"}
          onOpenEnded={() => endSheet.current?.open()}
        />
        <FocusTiles stats={stats} />
        <HistoryCard
          sessions={sessions}
          data={data}
          meta={`Esta semana ${minutesText(weekTotals.minutes)} · ${sessionsText(weekTotals.count)}`}
          onNote={(id, note) =>
            run(async () => {
              patch({ type: "note", id, note: note.trim() || null });
              await updateFocusNote(id, note);
            })
          }
          onDelete={(id) => {
            run(async () => {
              patch({ type: "remove", id });
              await deleteFocusSession(id);
            });
            notifyDeleted("Sesión borrada");
          }}
        />
      </main>
      <Sheet ref={endSheet} title="Enfoque">
        {t.ended && <EndedForm key={t.ended.endedAt} t={t} targets={data.targets} onSave={saveEnded} onDiscard={() => {
              endSheet.current?.close();
              discardEnded();
              notifyInfo("Sesión descartada");
            }} />}
      </Sheet>
    </>
  );
}

// ─── El reloj ─────────────────────────────────────────────────────────────

function TimerCard({
  t,
  targets,
  meta,
  onOpenEnded,
  className,
}: {
  t: FocusTimerState;
  targets: FocusTarget[];
  meta: string;
  onOpenEnded: () => void;
  className?: string;
}) {
  const left = useRemaining(t);
  const settingsSheet = useRef<SheetHandle>(null);
  const targetSheet = useRef<SheetHandle>(null);
  const [settingsKey, setSettingsKey] = useState(0);
  const every = t.settings.every;
  const done = sessionsDone(t);
  const fraction = t.status === "ended" ? 0 : t.durationMs ? left / t.durationMs : 1;
  const isBreak = t.mode !== "focus";

  const R = 96;
  const C = 2 * Math.PI * R;
  const pos = cyclePosition(done, every);
  const clamped = Math.max(0, Math.min(1, fraction));
  // Los pasos de la tarea ligada (de la tarea o del bloque que la tiene), para tildar mientras corre.
  const taskId = t.link?.taskId ?? null;
  const steps = useMemo(() => (taskId ? (targets.find((x) => x.taskId === taskId)?.steps ?? []) : []), [targets, taskId]);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const stepsDone = steps.filter((s) => ticked[s.id] ?? s.done).length;

  function changeMode(m: FocusMode) {
    if (m === t.mode) return;
    if (t.status === "ended") return notifyInfo("Anotá o descartá la sesión terminada primero.");
    if (t.status !== "idle" && t.mode === "focus" && t.durationMs - left >= MIN_SAVE_MS) return notifyInfo("Terminá o reiniciá la sesión para cambiar.");
    setMode(m);
  }

  const label = t.status === "ended" ? "Terminó" : t.status === "paused" ? `${MODE_LABEL[t.mode]} · en pausa` : MODE_LABEL[t.mode];
  const headMeta =
    t.status === "running" && t.endsAt ? `${isBreak ? MODE_LABEL[t.mode] : `Sesión ${pos} de ${every}`} · termina ${hourText(t.endsAt)}` : meta;

  return (
    <TintedCard
      icon={Timer}
      title="Enfoque"
      meta={headMeta}
      action={
        <button
          type="button"
          onClick={() => {
            setSettingsKey((k) => k + 1);
            settingsSheet.current?.open();
          }}
          className="tcard-pill press"
        >
          <GearSix size={14} aria-hidden /> Tiempos
        </button>
      }
      className={className}
      bodyClassName="gap-6! pt-5! pb-6! lg:grid! lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-10! lg:p-8!"
    >
      <div className="grid justify-items-center gap-5">
        <PillSwitch
          label="Parte"
          value={t.mode}
          options={FOCUS_MODES}
          onChange={changeMode}
          className="w-full max-w-sm"
          item="h-8 px-1 text-[12px] min-[400px]:text-[12.5px] sm:px-3 sm:text-[13px]"
        />

        <div className="relative grid size-[min(78vw,312px)] place-items-center" role="timer" aria-label={`${clockText(left)} restantes`}>
          <svg viewBox="0 0 240 240" className="absolute inset-0 size-full -rotate-90" aria-hidden>
            {/* Marcas de reloj: una por minuto de la vuelta; cada cinco, más largas. Lo que ya pasó, más tenue. */}
            {Array.from({ length: 60 }, (_, i) => {
              const a = (i / 60) * 2 * Math.PI;
              const long = i % 5 === 0;
              const r2 = long ? 108 : 112;
              return (
                <line
                  key={i}
                  x1={r3(120 + 118 * Math.cos(a))}
                  y1={r3(120 + 118 * Math.sin(a))}
                  x2={r3(120 + r2 * Math.cos(a))}
                  y2={r3(120 + r2 * Math.sin(a))}
                  strokeWidth={long ? 2 : 1.2}
                  strokeLinecap="round"
                  className="stroke-[var(--faint)]"
                  opacity={i / 60 < 1 - clamped ? 0.25 : 0.7}
                />
              );
            })}
            <circle cx="120" cy="120" r={R} fill="none" strokeWidth="10" className="stroke-[var(--surface-2)]" />
            <circle
              cx="120"
              cy="120"
              r={R}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - clamped)}
              style={{ stroke: isBreak ? "var(--c-habitos)" : "var(--accent)" }}
              className={cx(t.status === "running" && "transition-[stroke-dashoffset] duration-300 ease-linear motion-reduce:transition-none")}
            />
          </svg>
          <div className="relative grid justify-items-center gap-2">
            <span className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">{label}</span>
            {t.status === "ended" ? (
              <CheckCircle size={52} weight="fill" className="text-[var(--accent)]" aria-hidden />
            ) : (
              <span className="figure tabular text-[clamp(50px,15vw,68px)] leading-none text-fg">{clockText(left)}</span>
            )}
            {/* En qué sesión del ciclo vas: las hechas llenas, la de ahora más larga. */}
            <div className="flex items-center gap-1.5" role="img" aria-label={`Sesión ${pos} de ${every}`}>
              {Array.from({ length: every }, (_, i) => (
                <span
                  key={i}
                  className={cx(
                    "h-1.5 rounded-full",
                    i === pos - 1 ? "w-9" : "w-5",
                    i < pos - 1 ? "bg-[var(--accent)]" : i === pos - 1 ? "bg-[color-mix(in_oklab,var(--accent)_55%,transparent)]" : "bg-surface-2",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid w-full content-center gap-4">
        {/* Trabajando en: la tarea con sus pasos para tildar ahí mismo. */}
        <div className="grid gap-2 rounded-2xl border border-line bg-[color-mix(in_oklab,var(--surface-2)_60%,transparent)] p-3.5">
          <div className="flex items-center gap-2">
            <Target size={15} className="text-muted" aria-hidden />
            <span className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">Trabajando en</span>
            <button
              type="button"
              onClick={() => targetSheet.current?.open()}
              className="press ml-auto inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-[12.5px] text-muted hover:bg-surface hover:text-fg"
            >
              {t.link ? "Cambiar" : "Elegir"} <CaretDown size={12} aria-hidden />
            </button>
          </div>
          {t.link ? (
            <p className="text-[17px] leading-snug font-semibold text-fg">{t.link.title}</p>
          ) : (
            <button type="button" onClick={() => targetSheet.current?.open()} className="text-left text-[15px] text-muted hover:text-fg">
              Elegí una tarea o un bloque de hoy, o escribí otra cosa.
            </button>
          )}
          {steps.length > 0 && (
            <ul className="grid gap-0.5">
              {steps.map((s) => {
                const on = ticked[s.id] ?? s.done;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        haptic("select");
                        setTicked((m) => ({ ...m, [s.id]: !on }));
                        quiet(toggleSubtask(s.id, !on));
                      }}
                      className="tap-tint flex min-h-9 w-full items-center gap-2 rounded-lg px-1 text-left text-[14px]"
                    >
                      {on ? (
                        <CheckCircle size={18} weight="fill" className="shrink-0 text-[var(--c-habitos)]" aria-hidden />
                      ) : (
                        <Circle size={18} className="shrink-0 text-faint" aria-hidden />
                      )}
                      <span className={cx("min-w-0 truncate", on ? "text-muted line-through" : "text-fg")}>{s.title}</span>
                    </button>
                  </li>
                );
              })}
              <li className="px-1 pt-0.5 font-mono text-[11.5px] text-muted">
                {stepsDone} de {steps.length} pasos
              </li>
            </ul>
          )}
        </div>

        <div className="flex w-full items-center gap-2 sm:gap-3">
          <IconButton label="Reiniciar" onClick={() => reset()} disabled={t.status === "idle" || t.status === "ended"} className="size-11 shrink-0 border border-line disabled:opacity-40">
            <ArrowCounterClockwise size={18} />
          </IconButton>
          {t.status === "ended" ? (
            <Button onClick={onOpenEnded} className="h-13 min-w-0 flex-1 px-4 text-[15.5px]">
              <NotePencil size={17} weight="bold" aria-hidden /> Anotar sesión
            </Button>
          ) : (
            <Button
              onClick={() => {
                haptic("tap");
                toggle();
              }}
              className="h-13 min-w-0 flex-1 px-4 text-[15.5px]"
            >
              {t.status === "running" ? <Pause size={17} weight="fill" aria-hidden /> : <Play size={17} weight="fill" aria-hidden />}
              {t.status === "running" ? "Pausar" : t.status === "paused" ? "Seguir" : "Empezar"}
            </Button>
          )}
          {t.status === "ended" ? (
            <Button
              variant="outline"
              onClick={() => {
                discardEnded();
                notifyInfo("Sesión descartada");
              }}
              className="h-11 shrink-0 px-3.5"
            >
              <X size={15} aria-hidden /> Descartar
            </Button>
          ) : (
            <Button variant="outline" onClick={() => finish()} disabled={t.status === "idle"} className="h-11 shrink-0 px-3.5">
              <Stop size={15} weight="fill" aria-hidden /> Terminar
            </Button>
          )}
        </div>

        <div className="flex w-full items-center gap-3 border-t border-line pt-4">
          <label htmlFor="enfoque-aviso" className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-[14px] font-medium text-fg">Avisar al celular y al reloj</span>
            <span className="text-[12.5px] leading-snug text-muted">Cuando termina la sesión o el descanso, a los aparatos de Avisos.</span>
          </label>
          <Switch
            id="enfoque-aviso"
            checked={!!t.push}
            onChange={(on) => {
              haptic("select");
              setPush(on);
              quiet(saveFocusPush(on));
            }}
          />
        </div>
      </div>

      <Sheet ref={settingsSheet} title="Tiempos">
        <SettingsForm key={settingsKey} settings={t.settings} onDone={() => settingsSheet.current?.close()} />
      </Sheet>
      <Sheet ref={targetSheet} title="¿En qué vas a trabajar?">
        <TargetPicker
          targets={targets}
          current={t.link}
          onPick={(l) => {
            setLink(l);
            haptic("select");
            targetSheet.current?.close();
          }}
        />
      </Sheet>
    </TintedCard>
  );
}

function SettingsForm({ settings, onDone }: { settings: FocusSettings; onDone: () => void }) {
  const [draft, setDraft] = useState<Record<keyof FocusSettings, string>>(() => toDraft(settings));
  const fields: { key: keyof FocusSettings; label: string; hint: string }[] = [
    { key: "focus", label: "Enfoque", hint: "minutos" },
    { key: "short", label: "Descanso corto", hint: "minutos" },
    { key: "long", label: "Descanso largo", hint: "minutos" },
    { key: "every", label: "Descanso largo cada", hint: "sesiones" },
  ];
  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const next = normalizeFocusSettings(draft);
        syncSettings(next);
        quiet(saveFocusSettings(next));
        haptic("success");
        onDone();
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} hint={`${f.hint} (${FOCUS_LIMITS[f.key][0]} a ${FOCUS_LIMITS[f.key][1]})`}>
            <Input
              type="number"
              inputMode="numeric"
              min={FOCUS_LIMITS[f.key][0]}
              max={FOCUS_LIMITS[f.key][1]}
              value={draft[f.key]}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
      <p className="text-[13px] text-muted">Si hay una sesión corriendo, los tiempos nuevos valen desde la próxima.</p>
      <Button type="submit">Guardar</Button>
    </form>
  );
}

const toDraft = (s: FocusSettings) => ({ focus: String(s.focus), short: String(s.short), long: String(s.long), every: String(s.every) });

function TargetPicker({ targets, current, onPick }: { targets: FocusTarget[]; current: FocusLink | null; onPick: (l: FocusLink | null) => void }) {
  const [q, setQ] = useState("");
  const [free, setFree] = useState("");
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = q.trim() ? targets.filter((x) => fold(x.title).includes(fold(q.trim()))) : targets;
  const blocks = shown.filter((x) => x.kind === "block");
  const tasks = shown.filter((x) => x.kind === "task");
  const isCurrent = (x: FocusTarget) => (x.kind === "block" ? current?.blockId === x.id : !current?.blockId && current?.taskId === x.id);
  const row = (x: FocusTarget) => (
    <li key={`${x.kind}-${x.id}`}>
      <button
        type="button"
        onClick={() => onPick(x.kind === "block" ? { blockId: x.id, taskId: x.taskId, title: x.title } : { taskId: x.id, blockId: null, title: x.title })}
        className="tap-tint flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1 truncate">{x.title}</span>
        {x.steps.length > 0 && <span className="shrink-0 font-mono text-[12px] text-muted">{x.steps.filter((s) => s.done).length}/{x.steps.length}</span>}
        {isCurrent(x) && <Check size={16} weight="bold" className="shrink-0 text-[var(--accent)]" aria-label="Elegida" />}
      </button>
    </li>
  );
  return (
    <div className="grid gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (free.trim()) onPick({ title: free.trim().slice(0, 200), taskId: null, blockId: null });
        }}
      >
        <Input value={free} onChange={(e) => setFree(e.target.value)} placeholder="Otra cosa (escribila)" aria-label="Otra cosa" maxLength={200} />
        <Button type="submit" variant="outline" disabled={!free.trim()} className="h-11 shrink-0">
          Usar
        </Button>
      </form>
      <button
        type="button"
        onClick={() => onPick(null)}
        className="tap-tint flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-[15px] text-muted hover:bg-surface-2"
      >
        <span className="flex-1">Sin tarea</span>
        {!current && <Check size={16} weight="bold" className="text-[var(--accent)]" aria-label="Elegida" />}
      </button>
      {targets.length > 8 && (
        <label className="relative block">
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar una tarea" aria-label="Buscar una tarea" lang="es" className={cx(inputClass, "pl-9")} />
        </label>
      )}
      {blocks.length > 0 && (
        <section className="grid gap-1">
          <h3 className="kicker px-3">Bloques de hoy</h3>
          <ul className="grid">{blocks.map(row)}</ul>
        </section>
      )}
      {tasks.length > 0 && (
        <section className="grid gap-1">
          <h3 className="kicker px-3">Tareas abiertas</h3>
          <ul className="grid">{tasks.map(row)}</ul>
        </section>
      )}
      {shown.length === 0 && <p className="px-3 text-[14px] text-muted">{q.trim() ? "No hay tareas con ese nombre." : "No tenés tareas abiertas en el Plan."}</p>}
    </div>
  );
}

// ─── Cifras ───────────────────────────────────────────────────────────────

/** Hoy, la semana (contra la anterior a esta altura), la racha y el promedio por día con enfoque. */
function FocusTiles({ stats }: { stats: ReturnType<typeof focusStats> }) {
  const diff = stats.weekMin - stats.prevWeekMin;
  const vs =
    stats.prevWeekMin === 0 && stats.weekMin === 0
      ? "Todavía nada"
      : Math.abs(diff) < 5
        ? "Igual que la anterior"
        : `${diff > 0 ? "+" : "−"}${minutesText(Math.abs(diff))} contra la anterior`;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <StatTile icon={Timer} label="Hoy" figure={minutesText(stats.todayMin)} sub={stats.todayCount ? sessionsText(stats.todayCount) : "Todavía nada"} />
      <StatTile icon={CalendarBlank} label="Esta semana" figure={minutesText(stats.weekMin)} sub={vs} />
      <StatTile icon={Fire} label="Racha" figure={`${stats.streak}${stats.streakOpen ? "+" : ""}`} unit={stats.streak === 1 ? "día" : "días"} sub="seguidos con enfoque" />
      <StatTile icon={Lightning} label="Promedio" figure={minutesText(stats.avgMin)} sub={stats.activeDays ? "por día con enfoque" : "Sin sesiones todavía"} />
    </div>
  );
}

// ─── Sesión terminada ─────────────────────────────────────────────────────

function EndedForm({
  t,
  targets,
  onSave,
  onDiscard,
}: {
  t: FocusTimerState;
  targets: FocusTarget[];
  onSave: (note: string, then: "break" | "focus") => void;
  onDiscard: () => void;
}) {
  const e = t.ended!;
  const [note, setNote] = useState("");
  const taskId = e.link?.taskId ?? null;
  const steps = useMemo(() => (taskId ? (targets.find((x) => x.taskId === taskId)?.steps ?? []) : []), [targets, taskId]);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const nextBreak = breakAfter(sessionsDone(t) + 1, t.settings.every);
  const breakMin = nextBreak === "long" ? t.settings.long : t.settings.short;
  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-fg)]">
          <Check size={22} weight="bold" aria-hidden />
        </span>
        <div className="grid min-w-0 gap-0.5">
          <p className="text-[16px] font-semibold text-fg">Sesión terminada · {minutesText(e.minutes)}</p>
          <p className="truncate text-[13.5px] text-muted">
            {e.link?.title ? `${e.link.title} · ` : ""}
            {rangeText(e.startedAt, e.endedAt)}
          </p>
        </div>
      </div>
      <label className="grid gap-1.5">
        <span className="kicker">¿Qué hiciste?</span>
        <textarea
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
          lang="es"
          spellCheck
          rows={4}
          maxLength={2000}
          placeholder="Lo que avanzaste, lo que quedó por hacer…"
          className={cx(inputClass, "h-auto min-h-28 resize-y py-2.5 leading-snug")}
        />
      </label>
      {steps.length > 0 && (
        <div className="grid gap-2">
          <span className="kicker">Pasos de la tarea</span>
          <div className="flex flex-wrap gap-2">
            {steps.map((s) => {
              const on = ticked[s.id] ?? s.done;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    haptic("select");
                    setTicked((m) => ({ ...m, [s.id]: !on }));
                    quiet(toggleSubtask(s.id, !on));
                  }}
                  className={cx(
                    "press inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-[13.5px]",
                    on ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-fg)] line-through" : "border-line-strong text-fg hover:bg-surface-2",
                  )}
                >
                  {on && <Check size={13} weight="bold" aria-hidden />}
                  <span className="truncate">{s.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button onClick={() => onSave(note, "break")}>Guardar y descansar {breakMin} min</Button>
        <Button variant="outline" onClick={() => onSave(note, "focus")}>
          Guardar y otra sesión
        </Button>
      </div>
      <button type="button" onClick={onDiscard} className="justify-self-center rounded-full px-3 py-2 text-[13.5px] text-muted hover:bg-surface-2 hover:text-fg">
        Descartar esta sesión
      </button>
    </div>
  );
}

// ─── Historial ────────────────────────────────────────────────────────────

function HistoryCard({
  sessions,
  data,
  meta,
  onNote,
  onDelete,
  className,
}: {
  sessions: FocusSessionDTO[];
  data: FocusPageData;
  meta: string;
  onNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}) {
  const { today, monday } = data;
  const week = weekMinutes(sessions, monday);
  const max = Math.max(60, ...week);
  const groups = groupByDay(sessions.filter((s) => s.day >= addDays(today, -(data.days - 1))));
  const noteSheet = useRef<SheetHandle>(null);
  const [editing, setEditing] = useState<FocusSessionDTO | null>(null);
  const [draft, setDraft] = useState("");
  const commit = () => {
    if (editing && draft.trim() !== (editing.note ?? "")) onNote(editing.id, draft);
  };
  const cols = { gridTemplateColumns: "repeat(7, minmax(0, 1fr))" };

  const open = (s: FocusSessionDTO) => {
    setEditing(s);
    setDraft(s.note ?? "");
    noteSheet.current?.open();
  };
  const menu = (e: React.MouseEvent, s: FocusSessionDTO) =>
    showContextMenu(
      e,
      [
        { label: "Editar nota", icon: <NotePencil size={15} />, onSelect: () => open(s) },
        { label: "Borrar", icon: <Trash size={15} />, danger: true, onSelect: () => onDelete(s.id) },
      ],
      `${minutesText(s.minutes)} · ${hourText(s.startedAt)}`,
    );

  return (
    <TintedCard icon={ClockCounterClockwise} title="Historial" meta={meta} className={className} bodyClassName="gap-5!">
      {week.every((m) => m === 0) ? (
        <p className="text-[13.5px] text-muted">Esta semana todavía no hubo sesiones.</p>
      ) : (
      <div className="grid gap-1.5">
        <div className="grid h-24 items-end gap-2" style={cols} role="img" aria-label={`Minutos por día esta semana: ${week.map((m, i) => `${weekdayInitial(addDays(monday, i))} ${minutesText(m)}`).join(", ")}`}>
          {week.map((m, i) => {
            const d = addDays(monday, i);
            return (
              <div key={d} className="flex h-full min-w-0 flex-col items-center justify-end gap-1">
                {m > 0 && <span className="font-mono text-[10.5px] whitespace-nowrap text-muted">{minutesShort(m)}</span>}
                <span
                  className={cx("w-full max-w-10 rounded-t-md", m > 0 ? "bg-[var(--accent)]" : d <= today ? "bg-surface-2" : "")}
                  style={{ height: m > 0 ? `${Math.max(6, (m / max) * 100)}%` : d <= today ? "4px" : 0 }}
                />
              </div>
            );
          })}
        </div>
        <div className="grid gap-2 border-t border-line pt-1.5" style={cols} aria-hidden>
          {week.map((_, i) => {
            const d = addDays(monday, i);
            return (
              <span key={d} className={cx("text-center font-mono text-[11px]", d === today ? "font-semibold text-fg" : "text-muted")}>
                {weekdayInitial(d)}
              </span>
            );
          })}
        </div>
      </div>
      )}

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-5 py-6 text-[15px] text-muted">Todavía no hay sesiones. Empezá una y, al terminar, anotá qué hiciste.</p>
      ) : (
        <div className="grid gap-4">
          {groups.map((g) => (
            <section key={g.day} className="grid gap-1">
              <h3 className="flex items-baseline justify-between gap-3 px-1">
                <span className="text-[14px] font-semibold text-fg">{cap(formatRelative(g.day, today))}</span>
                <span className="font-mono text-[12px] text-muted">
                  {minutesText(g.minutes)} · {sessionsText(g.sessions.length)}
                </span>
              </h3>
              <ul className="grid divide-y divide-line overflow-hidden rounded-xl border border-line">
                {g.sessions.map((s) => (
                  <SessionRow key={s.id} s={s} onOpen={() => open(s)} onMenu={(e) => menu(e, s)} />
                ))}
              </ul>
            </section>
          ))}
          {data.hasOlder && (
            <Link href={`/enfoque?dias=${data.days + 14}`} scroll={false} className="press justify-self-center rounded-full border border-line-strong px-4 py-2 text-[13.5px] font-medium hover:bg-surface-2">
              Cargar más
            </Link>
          )}
        </div>
      )}

      <Sheet
        ref={noteSheet}
        title="Sesión de enfoque"
        // Tocar afuera, la X o Escape también guardan lo escrito.
        onDismiss={commit}
      >
        {editing && (
          <NoteForm
            s={editing}
            note={draft}
            setNote={setDraft}
            onSave={() => {
              commit();
              noteSheet.current?.close();
            }}
            onDelete={() => {
              noteSheet.current?.close();
              onDelete(editing.id);
            }}
          />
        )}
      </Sheet>
    </TintedCard>
  );
}

function SessionRow({ s, onOpen, onMenu }: { s: FocusSessionDTO; onOpen: () => void; onMenu: (e: React.MouseEvent) => void }) {
  const hold = useHoldMenu(onMenu);
  return (
    <li>
      <button type="button" onClick={onOpen} {...hold} className="tap-tint flex min-h-14 w-full items-center gap-3 bg-surface px-3 py-2.5 text-left hover:bg-surface-2">
        <span className="w-11 shrink-0 font-mono text-[13px] text-muted">{hourText(s.startedAt)}</span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className={cx("line-clamp-2 text-[15px] leading-snug", s.note ? "text-fg" : "text-muted")}>{s.note ?? "Sin nota"}</span>
          <span className="truncate text-[12.5px] text-muted">{s.title ?? "Sin tarea"}</span>
        </span>
        <span className="shrink-0 font-mono text-[13px] text-fg">{minutesText(s.minutes)}</span>
      </button>
    </li>
  );
}

function NoteForm({ s, note, setNote, onSave, onDelete }: { s: FocusSessionDTO; note: string; setNote: (v: string) => void; onSave: () => void; onDelete: () => void }) {
  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <p className="text-[14px] text-muted">
        {minutesText(s.minutes)} · {rangeText(s.startedAt, s.endedAt)}
        {s.title ? ` · ${s.title}` : ""}
      </p>
      <label className="grid gap-1.5">
        <span className="kicker">¿Qué hiciste?</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          lang="es"
          spellCheck
          rows={4}
          maxLength={2000}
          className={cx(inputClass, "h-auto min-h-28 resize-y py-2.5 leading-snug")}
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="danger" onClick={onDelete}>
          <Trash size={15} aria-hidden /> Borrar
        </Button>
        <Button type="submit">Guardar</Button>
      </div>
    </form>
  );
}
