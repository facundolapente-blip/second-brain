"use client";

import { useRef, useState } from "react";
import { BookOpenText, CaretRight, ChartPolar, ClockCounterClockwise, DotsThreeVertical, Minus, NotePencil, Plus, Trash, Eye } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { TintedCard } from "@/components/tinted-card";
import { PillSwitch } from "@/components/pill-switch";
import { Button, cx, Input, Sheet, type SheetHandle } from "@/components/ui";
import { quiet } from "@/components/safe-action";
import { notifyDeleted, notifyError } from "@/components/undo-toast";
import { showContextMenu } from "@/components/context-menu";
import { useHoldMenu } from "@/components/hold-menu";
import { haptic } from "@/components/haptics";
import { formatLong } from "@/lib/dates";
import {
  formatDelta,
  formatScore,
  nextWheelDate,
  petalRadius,
  radarAt,
  radarPoints,
  joinWheelNote,
  noteByArea,
  scoreDelta,
  splitWheelNote,
  WHEEL_AREAS,
  wheelArcPath,
  wheelAverage,
  wheelSlicePath,
  type WheelScores,
} from "@/lib/life-wheel";
import { deleteWheel, saveWheel } from "@/lib/offline/wheel";
import type { WheelDTO } from "@/lib/wheels";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
/** "jun 2026" */
const monthYear = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
/** "8 jun 2026" */
const dayMonthYear = (iso: string) => `${Number(iso.slice(8, 10))} ${monthYear(iso)}`;

type View = "rueda" | "radar" | "barras";

const tone = (d: number | null) => (d === null || d === 0 ? "text-muted" : d > 0 ? "text-[var(--st-done-fg)]" : "text-danger");

/** Color lleno de un área (`--p-{color}-chip`, con versión clara y oscura). */
const areaColor = (c: string) => `var(--p-${c}-chip)`;

/**
 * Rueda de la vida (pedido de Facu, 2026-11-14; diseño A "rueda de colores" el mismo día).
 * Arriba la rueda elegida (la última, si no) en tres vistas: la rueda de pétalos (una
 * porción de color por área, llena hasta el puntaje, con la otra rueda en punteado),
 * la telaraña y las barras; al lado, cada área con su puntaje y cuánto cambió.
 * "Comparar con" elige contra cuál de las anteriores. Abajo, todas las ruedas en
 * miniatura. La app avisa en Inicio a los 9 meses de la última.
 */
export function RuedaView({ wheels, today }: { wheels: WheelDTO[]; today: string }) {
  // Lo guardado o borrado se ve al toque; cuando llega lo del servidor, manda eso.
  const [list, setList] = useState(wheels);
  const [prev, setPrev] = useState(wheels);
  if (prev !== wheels) {
    setPrev(wheels);
    setList(wheels);
  }
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [view, setView] = useState<View>("rueda");
  const pickView = (v: View) => setView(v);

  const sheet = useRef<SheetHandle>(null);
  const [editing, setEditing] = useState<WheelDTO | null>(null);
  const [formKey, setFormKey] = useState(0);
  const openForm = (w: WheelDTO | null) => {
    setEditing(w);
    setFormKey((k) => k + 1);
    sheet.current?.open();
  };

  // Leer lo que escribió en una rueda (doble clic en la fecha, o "Leer" en el menú).
  const readSheet = useRef<SheetHandle>(null);
  const [reading, setReading] = useState<WheelDTO | null>(null);
  const openRead = (w: WheelDTO, area?: string) => {
    setReading(w);
    readSheet.current?.open();
    if (area) {
      // Después de dibujar la hoja: ir al bloque de esa área y marcarlo un momento.
      setTimeout(() => {
        const el = document.getElementById(areaAnchor(area));
        if (!el) return;
        el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        el.classList.add("rueda-flash");
        setTimeout(() => el.classList.remove("rueda-flash"), 1400);
      }, 120);
    }
  };

  const sel = list.find((w) => w.id === selectedId) ?? list[0] ?? null;
  const older = sel ? list.filter((w) => w.id !== sel.id && w.date <= sel.date) : [];
  const cmp = (compareId ? list.find((w) => w.id === compareId && w.id !== sel?.id) : null) ?? older[0] ?? null;
  const avg = sel ? wheelAverage(sel.scores) : null;
  const cmpAvg = cmp ? wheelAverage(cmp.scores) : null;
  const avgDelta = avg !== null && cmpAvg !== null ? Math.round((avg - cmpAvg) * 10) / 10 : null;
  const latest = list[0];
  const next = latest ? nextWheelDate(latest.date) : null;
  const due = next !== null && next <= today;
  // Tocar un área (porción, rótulo o renglón) abre lo escrito en esa parte, si hay algo escrito.
  const onArea = sel?.note ? (a: string) => openRead(sel, a) : undefined;

  function remove(w: WheelDTO) {
    setList((l) => l.filter((x) => x.id !== w.id));
    if (selectedId === w.id) setSelectedId(null);
    quiet(
      deleteWheel(w.id)
        .then(() => notifyDeleted("Rueda borrada"))
        .catch((e) => {
          setList(wheels);
          throw e;
        }),
    );
  }
  function wheelMenu(e: React.MouseEvent, w: WheelDTO) {
    showContextMenu(
      e,
      [
        ...(w.note ? [{ label: "Leer lo que escribiste", icon: <BookOpenText size={15} />, onSelect: () => openRead(w) }] : []),
        { label: "Ver esta rueda", icon: <Eye size={15} />, onSelect: () => (setSelectedId(w.id), setCompareId(null)) },
        { label: "Editar", icon: <NotePencil size={15} />, onSelect: () => openForm(w) },
        { label: "Borrar", icon: <Trash size={15} />, danger: true, onSelect: () => remove(w) },
      ],
      `Rueda del ${dayMonthYear(w.date)}`,
    );
  }

  return (
    <>
      <PageHeader title="Rueda de la vida" kicker="Herramientas" wide />
      <main className="mx-auto grid max-w-6xl gap-4 px-4 pt-2 pb-16 lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-4">
        <TintedCard
          tone="inicio"
          icon={ChartPolar}
          title="Rueda de la vida"
          meta={sel ? `Promedio ${avg !== null ? formatScore(avg) : "–"}${next ? ` · próxima ${dayMonthYear(next)}` : ""}` : "Todavía no hiciste ninguna"}
          action={
            <button type="button" onClick={() => openForm(null)} className="tcard-pill press">
              <Plus size={13} weight="bold" aria-hidden /> Nueva rueda
            </button>
          }
          className="lg:col-span-12"
          bodyClassName="gap-4!"
        >
          {due && (
            <button
              type="button"
              onClick={() => openForm(null)}
              className="flex items-center gap-2 rounded-xl bg-[var(--st-skip-bg)] px-3 py-2.5 text-left text-[13.5px] text-[var(--st-skip-fg)]"
            >
              <ClockCounterClockwise size={17} aria-hidden className="shrink-0" />
              Ya pasaron 9 meses desde la última rueda ({dayMonthYear(latest!.date)}). Te toca hacer una nueva.
            </button>
          )}
          {sel ? (
            <>
              <div className="grid gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <h3 className="text-[17px] font-semibold">
                    <span className="font-normal text-muted">Rueda del </span>
                    {dayMonthYear(sel.date)}
                  </h3>
                  <PillSwitch
                    label="Vista"
                    value={view}
                    onChange={pickView}
                    options={[
                      { value: "rueda", label: "Rueda" },
                      { value: "radar", label: "Telaraña" },
                      { value: "barras", label: "Barras" },
                    ]}
                  />
                </div>
                {older.length > 0 && (
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label="Comparar con">
                    <span className="text-[12px] text-muted">Comparar con</span>
                    {older.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        aria-pressed={cmp?.id === w.id}
                        onClick={() => (haptic("select"), setCompareId(w.id))}
                        className={cx(
                          "press min-h-8 rounded-full border px-2.5 text-[12px] whitespace-nowrap",
                          cmp?.id === w.id ? "border-transparent bg-[var(--p-orange-chip)] text-[var(--p-orange-chip-fg)]" : "border-line-strong text-fg hover:bg-surface-2",
                        )}
                      >
                        {monthYear(w.date)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {view === "barras" ? (
                <div className="grid gap-3">
                  <Bars cur={sel.scores} cmp={cmp?.scores ?? null} avg={avg} avgDelta={avgDelta} onArea={onArea} />
                  <Legend sel={sel} cmp={cmp} avg={avg} cmpAvg={cmpAvg} />
                </div>
              ) : (
                <div className="grid items-center gap-4 lg:grid-cols-2 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:gap-10">
                  <div className="grid gap-2">
                    {view === "rueda" ? (
                      <PetalWheel w={sel} cmp={cmp} avg={avg} avgDelta={avgDelta} onArea={onArea} />
                    ) : (
                      <Radar cur={sel.scores} cmp={cmp?.scores ?? null} onArea={onArea} />
                    )}
                    {view === "rueda" ? <DashedLegend cmp={cmp} cmpAvg={cmpAvg} /> : <Legend sel={sel} cmp={cmp} avg={avg} cmpAvg={cmpAvg} />}
                  </div>
                  <AreaList cur={sel.scores} cmp={cmp?.scores ?? null} onArea={onArea} />
                </div>
              )}
              {sel.note && (
                <button type="button" onClick={() => openRead(sel)} className="tap-tint grid gap-1.5 rounded-xl bg-surface-2 px-3 py-2.5 text-left">
                  <span className="line-clamp-3 text-[13.5px] text-muted">{notePreview(sel.note)}</span>
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg">
                    <BookOpenText size={15} aria-hidden /> Leer lo que escribiste
                  </span>
                </button>
              )}
            </>
          ) : (
            <div className="grid justify-items-start gap-3 py-2">
              <p className="text-[14px] text-muted">Puntuá de 0 a 10 cómo estás en cada área de tu vida. Cada 9 meses hacés otra y ves qué cambió.</p>
              <Button variant="accent" onClick={() => openForm(null)}>
                Hacer mi primera rueda
              </Button>
            </div>
          )}
        </TintedCard>

        <TintedCard tone="inicio" icon={ClockCounterClockwise} title="Tus ruedas" meta={`${list.length} ${list.length === 1 ? "rueda" : "ruedas"}`} className="lg:col-span-12" bodyClassName="p-0! gap-0!">
          {list.length === 0 ? (
            <p className="px-4 py-4 text-[13.5px] text-muted">Las ruedas que hagas van a quedar acá.</p>
          ) : (
            <ul className="flex gap-2.5 overflow-x-auto overscroll-x-contain px-4 py-4 [scrollbar-width:thin] lg:flex-wrap lg:overflow-visible" aria-label="Todas tus ruedas">
              {list.map((w, i) => (
                <MiniWheelItem
                  key={w.id}
                  w={w}
                  before={list[i + 1] ?? null}
                  selected={w.id === sel?.id}
                  onSelect={() => (setSelectedId(w.id), setCompareId(null))}
                  onMenu={(e) => wheelMenu(e, w)}
                  onRead={w.note ? () => openRead(w) : undefined}
                />
              ))}
            </ul>
          )}
        </TintedCard>
      </main>

      <Sheet ref={readSheet} title={reading ? `Rueda del ${dayMonthYear(reading.date)}` : "Rueda"} wide>
        {reading && (
          <WheelReading
            w={reading}
            before={list.find((x) => x.date < reading.date) ?? null}
            onEdit={() => {
              readSheet.current?.close();
              openForm(reading);
            }}
          />
        )}
      </Sheet>

      <Sheet ref={sheet} title={editing ? `Rueda del ${dayMonthYear(editing.date)}` : "Nueva rueda"} wide>
        <WheelForm
          key={formKey}
          editing={editing}
          last={editing ? (list.find((w) => w.date < editing.date) ?? null) : (latest ?? null)}
          today={today}
          onSaved={(w) => {
            setList((l) => [w, ...l.filter((x) => x.id !== w.id)].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
            setSelectedId(w.id);
            setCompareId(null);
            sheet.current?.close();
          }}
        />
      </Sheet>
    </>
  );
}

/** Telaraña: la rueda elegida llena, la de comparar con borde naranja. */
function Radar({ cur, cmp, onArea }: { cur: WheelScores; cmp: WheelScores | null; onArea?: (area: string) => void }) {
  const cx0 = 160;
  const cy0 = 140;
  const r = 96;
  const rings = [2, 4, 6, 8, 10];
  const n = WHEEL_AREAS.length;
  const ring = (v: number) => WHEEL_AREAS.map((_, i) => radarAt(i, cx0, cy0, (v / 10) * r)).map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <svg viewBox="0 0 320 280" className="mx-auto w-full max-w-[26rem]" role="img" aria-label="Telaraña de la rueda">
      <g fill="none" stroke="var(--line)">
        {rings.map((v) => (
          <polygon key={v} points={ring(v)} />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const p = radarAt(i, cx0, cy0, r);
          return <line key={i} x1={cx0} y1={cy0} x2={p.x} y2={p.y} />;
        })}
      </g>
      {cmp && <polygon points={radarPoints(cmp, cx0, cy0, r)} fill="color-mix(in oklab, var(--p-orange-chip) 14%, transparent)" stroke="var(--p-orange-chip)" strokeWidth={1.5} />}
      <polygon points={radarPoints(cur, cx0, cy0, r)} fill="color-mix(in oklab, var(--mod) 24%, transparent)" stroke="var(--mod)" strokeWidth={2.2} />
      {WHEEL_AREAS.map((a, i) => {
        if (cur[a.key] === undefined) return null;
        const p = radarAt(i, cx0, cy0, (cur[a.key] / 10) * r);
        return <circle key={a.key} cx={p.x} cy={p.y} r={4.2} fill={areaColor(a.color)} stroke="var(--surface)" strokeWidth={1.5} />;
      })}
      {WHEEL_AREAS.map((a, i) => {
        const p = radarAt(i, cx0, cy0, r + 20);
        const anchor = Math.abs(p.x - cx0) < 4 ? "middle" : p.x > cx0 ? "start" : "end";
        const label = (
          <text x={p.x} y={p.y + 4} textAnchor={anchor} fontSize={13} fill={onArea ? "var(--text)" : "var(--muted)"} fontFamily="var(--font-ui-sans)" textDecoration={onArea ? "underline" : undefined} className={onArea ? "[text-decoration-color:var(--line-strong)] [text-underline-offset:3px]" : undefined}>
            {a.short}
          </text>
        );
        if (!onArea) return <g key={a.key}>{label}</g>;
        return (
          <g
            key={a.key}
            role="button"
            tabIndex={0}
            aria-label={`Leer lo que escribiste sobre ${a.key}`}
            onClick={() => onArea(a.key)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onArea(a.key))}
            className="cursor-pointer outline-none [&:focus-visible_text]:fill-[var(--mod)] [&:hover_text]:fill-[var(--mod)]"
          >
            {/* Zona de toque más grande que la palabra. */}
            <rect x={anchor === "middle" ? p.x - 44 : anchor === "start" ? p.x - 6 : p.x - 88} y={p.y - 12} width={94} height={24} fill="transparent" />
            {label}
          </g>
        );
      })}
    </svg>
  );
}

function Legend({ sel, cmp, avg, cmpAvg }: { sel: WheelDTO; cmp: WheelDTO | null; avg: number | null; cmpAvg: number | null }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-3.5 rounded-[3px] border-[1.5px] border-[var(--mod)] bg-[color-mix(in_oklab,var(--mod)_30%,transparent)]" />
        {monthYear(sel.date)}
        {avg !== null && <span className="font-mono tabular">· {formatScore(avg)}</span>}
      </span>
      {cmp && (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-3.5 rounded-[3px] border-[1.5px] border-[var(--p-orange-chip)] bg-[color-mix(in_oklab,var(--p-orange-chip)_15%,transparent)]" />
          {monthYear(cmp.date)}
          {cmpAvg !== null && <span className="font-mono tabular">· {formatScore(cmpAvg)}</span>}
        </span>
      )}
    </div>
  );
}

/** Barras: el promedio grande y cada área con la otra rueda de fondo. */
function Bars({ cur, cmp, avg, avgDelta, onArea }: { cur: WheelScores; cmp: WheelScores | null; avg: number | null; avgDelta: number | null; onArea?: (area: string) => void }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[32px] leading-none font-semibold tabular">{avg !== null ? formatScore(avg) : "–"}</span>
        {avgDelta !== null && <span className={cx("font-mono text-[13px] tabular", tone(avgDelta))}>{formatDelta(avgDelta)}</span>}
        <span className="text-[12.5px] text-muted">promedio de 10</span>
      </div>
      <ul className="grid gap-2.5">
        {WHEEL_AREAS.map((a) => {
          const v = cur[a.key];
          const p = cmp?.[a.key];
          const d = scoreDelta(cur, cmp, a.key);
          return (
            <li key={a.key}>
              <AreaRow area={a.key} onArea={onArea} className="block w-full py-0.5">
              <div className="flex items-center justify-between text-[13.5px]">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: areaColor(a.color) }} />
                  {a.key}
                </span>
                <span className="font-mono tabular">
                  {v !== undefined ? formatScore(v) : "–"}
                  {d !== null && <span className={cx("ml-1.5", tone(d))}>{formatDelta(d)}</span>}
                </span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-surface-2">
                {p !== undefined && <span className="absolute inset-y-0 left-0 rounded-full bg-[color-mix(in_oklab,var(--p-orange-chip)_38%,var(--surface-2))]" style={{ width: `${p * 10}%` }} />}
                {v !== undefined && <span className="absolute top-[2px] left-0 h-1 rounded-full bg-[var(--mod)]" style={{ width: `${v * 10}%` }} />}
              </div>
              </AreaRow>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Medidas de la rueda de pétalos (en unidades del SVG): centro, radio con 10 y círculo del medio. */
const PW = { w: 340, h: 290, cx: 170, cy: 145, r: 104, r0: 30, gap: 3 };

/**
 * Rueda de pétalos (diseño A, elegido por Facu el 2026-11-14): una porción por área con
 * su color, de fondo la porción entera muy suave y encima llena hasta el puntaje; la
 * rueda con la que se compara, como un arco punteado a su puntaje; el promedio en el medio.
 */
function PetalWheel({
  w,
  cmp,
  avg,
  avgDelta,
  onArea,
}: {
  w: WheelDTO;
  cmp: WheelDTO | null;
  avg: number | null;
  avgDelta: number | null;
  onArea?: (area: string) => void;
}) {
  const { cx: x, cy: y, r, r0, gap } = PW;
  const cur = w.scores;
  const label =
    `Rueda del ${dayMonthYear(w.date)}, promedio ${avg !== null ? formatScore(avg) : "sin puntaje"}: ` +
    WHEEL_AREAS.map((a) => `${a.key} ${cur[a.key] !== undefined ? formatScore(cur[a.key]) : "sin puntaje"}`).join(", ") +
    (cmp ? `. En punteado, la del ${dayMonthYear(cmp.date)}.` : ".");
  return (
    <svg viewBox={`0 0 ${PW.w} ${PW.h}`} className="mx-auto w-full max-w-[25rem]" role={onArea ? "group" : "img"} aria-label={label}>
      <g fill="none" stroke="var(--line)">
        {[2, 4, 6, 8, 10].map((v) => (
          <circle key={v} cx={x} cy={y} r={petalRadius(v, r0, r)} />
        ))}
      </g>
      {WHEEL_AREAS.map((a, i) => {
        const v = cur[a.key];
        const c = cmp?.scores[a.key];
        const color = areaColor(a.color);
        const p = radarAt(i, x, y, r + 15);
        const anchor = Math.abs(p.x - x) < 4 ? "middle" : p.x > x ? "start" : "end";
        const body = (
          <>
            <path className="rueda-petal-bg" d={wheelSlicePath(i, x, y, r0, r, gap)} fill={color} fillOpacity={0.12} />
            {v !== undefined && <path d={wheelSlicePath(i, x, y, r0, petalRadius(v, r0, r), gap)} fill={color} fillOpacity={0.85} />}
            {c !== undefined && (
              <path d={wheelArcPath(i, x, y, petalRadius(c, r0, r), gap + 6)} fill="none" stroke="var(--text)" strokeWidth={1.6} strokeDasharray="3 3" strokeLinecap="round" />
            )}
            <text
              x={p.x}
              y={p.y + 4.5}
              textAnchor={anchor}
              fontSize={13}
              fontFamily="var(--font-ui-sans)"
              fill="currentColor"
              className={cx("rueda-petal-label", onArea ? "text-fg" : "text-muted")}
            >
              {a.short}
            </text>
          </>
        );
        if (!onArea) return <g key={a.key}>{body}</g>;
        return (
          <g
            key={a.key}
            role="button"
            tabIndex={0}
            aria-label={`Leer lo que escribiste sobre ${a.key}`}
            onClick={() => onArea(a.key)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onArea(a.key))}
            className="rueda-petal"
          >
            {body}
            {/* Zona de toque más grande que la palabra. */}
            <rect x={anchor === "middle" ? p.x - 50 : anchor === "start" ? p.x - 6 : p.x - 96} y={p.y - 12} width={102} height={26} fill="transparent" />
          </g>
        );
      })}
      <circle cx={x} cy={y} r={r0 - 3} fill="var(--surface)" stroke="var(--line)" />
      <text x={x} y={avgDelta !== null ? y + 3 : y + 8} textAnchor="middle" fontSize={23} fontWeight={600} fontFamily="var(--font-ui-sans)" fill="currentColor" className="text-fg tabular">
        {avg !== null ? formatScore(avg) : "–"}
      </text>
      {avgDelta !== null && (
        <text x={x} y={y + 17} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" fill="currentColor" className={cx("tabular", tone(avgDelta))}>
          {formatDelta(avgDelta)}
        </text>
      )}
    </svg>
  );
}

/** Qué es el punteado de la rueda de pétalos. */
function DashedLegend({ cmp, cmpAvg }: { cmp: WheelDTO | null; cmpAvg: number | null }) {
  if (!cmp) return null;
  return (
    <p className="text-center text-[12px] text-muted">
      <svg width="18" height="4" aria-hidden className="mr-1.5 inline-block align-middle">
        <line x1="1" y1="2" x2="17" y2="2" stroke="var(--text)" strokeWidth="1.6" strokeDasharray="3 3" strokeLinecap="round" />
      </svg>
      En punteado, la del {monthYear(cmp.date)}
      {cmpAvg !== null && <span className="font-mono tabular"> · {formatScore(cmpAvg)}</span>}
    </p>
  );
}

/** Cada área con su color, el puntaje y cuánto cambió contra la de comparar; tocarla abre lo escrito. */
function AreaList({ cur, cmp, onArea }: { cur: WheelScores; cmp: WheelScores | null; onArea?: (area: string) => void }) {
  return (
    <div className="grid gap-2">
      <ul className="grid">
        {WHEEL_AREAS.map((a) => {
          const v = cur[a.key];
          const d = scoreDelta(cur, cmp, a.key);
          const inner = (
            <>
              <span aria-hidden className="size-3 shrink-0 rounded-[4px]" style={{ background: areaColor(a.color) }} />
              <span className="min-w-0 flex-1 truncate text-[14px]">{a.key}</span>
              <span className="w-9 text-right font-mono text-[14px] font-medium tabular">{v !== undefined ? formatScore(v) : "–"}</span>
              <span className={cx("w-11 text-right font-mono text-[12px] tabular", tone(d))}>{d !== null ? formatDelta(d) : ""}</span>
              {onArea && (
                <>
                  <CaretRight size={14} aria-hidden className="shrink-0 text-faint" />
                  <span className="sr-only">, leer lo que escribiste</span>
                </>
              )}
            </>
          );
          return (
            <li key={a.key} className="border-b border-line last:border-b-0">
              {onArea ? (
                <button type="button" onClick={() => onArea(a.key)} className="tap-tint flex min-h-11 w-full items-center gap-2.5 rounded-md px-1.5 text-left hover:bg-surface-2">
                  {inner}
                </button>
              ) : (
                <div className="flex min-h-11 items-center gap-2.5 px-1.5">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      {onArea && <p className="px-1.5 text-[12px] text-muted">Tocá un área para leer lo que escribiste</p>}
    </div>
  );
}

/** Una rueda del historial en miniatura: tocar la elige, doble clic lee lo escrito, ⋯ / clic derecho / mantener apretado, el menú. */
function MiniWheelItem({
  w,
  before,
  selected,
  onSelect,
  onMenu,
  onRead,
}: {
  w: WheelDTO;
  before: WheelDTO | null;
  selected: boolean;
  onSelect: () => void;
  onMenu: (e: React.MouseEvent) => void;
  onRead?: () => void;
}) {
  const avg = wheelAverage(w.scores);
  const prevAvg = before ? wheelAverage(before.scores) : null;
  const d = avg !== null && prevAvg !== null ? Math.round((avg - prevAvg) * 10) / 10 : null;
  const hold = useHoldMenu(onMenu);
  return (
    <li {...hold} className="relative w-[8.25rem] shrink-0">
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onRead}
        title={onRead ? "Doble clic para leer lo que escribiste" : undefined}
        aria-current={selected ? "true" : undefined}
        className={cx(
          "tap-tint grid w-full justify-items-center gap-0.5 rounded-2xl border px-2 pt-3 pb-2.5 text-center",
          selected ? "border-[var(--mod)] bg-[color-mix(in_oklab,var(--mod)_8%,var(--surface))] ring-1 ring-[var(--mod)]" : "border-line hover:bg-surface-2",
        )}
      >
        <MiniWheel scores={w.scores} className={cx("mb-1.5 size-20", !selected && "opacity-70")} />
        <span className="inline-flex items-center gap-1 text-[13px] font-medium">
          {w.note && <BookOpenText size={13} aria-label="Tiene lo que escribiste" className="shrink-0 text-muted" />}
          {monthYear(w.date)}
        </span>
        <span className="font-mono text-[12px] tabular">
          <span className="font-medium">{avg !== null ? formatScore(avg) : "–"}</span>
          {d !== null && <span className={cx("ml-1.5", tone(d))}>{formatDelta(d)}</span>}
        </span>
      </button>
      <button
        type="button"
        onClick={onMenu}
        aria-label={`Opciones de la rueda del ${dayMonthYear(w.date)}`}
        className="absolute top-1 right-1 inline-flex size-7 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
      >
        <DotsThreeVertical size={17} weight="bold" />
      </button>
    </li>
  );
}

/** La rueda de pétalos chica, sin rótulos ni anillos. */
function MiniWheel({ scores, className }: { scores: WheelScores; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      {WHEEL_AREAS.map((a, i) => {
        const v = scores[a.key];
        const color = areaColor(a.color);
        return (
          <g key={a.key}>
            <path d={wheelSlicePath(i, 50, 50, 9, 48, 3)} fill={color} fillOpacity={0.14} />
            {v !== undefined && <path d={wheelSlicePath(i, 50, 50, 9, petalRadius(v, 9, 48), 3)} fill={color} fillOpacity={0.85} />}
          </g>
        );
      })}
    </svg>
  );
}

/** Completar o cambiar una rueda: un puntaje por área (de a 0,5 con − y +, o escrito), fecha y notas. */
function WheelForm({ editing, last, today, onSaved }: { editing: WheelDTO | null; last: WheelDTO | null; today: string; onSaved: (w: WheelDTO) => void }) {
  const [date, setDate] = useState(editing?.date ?? today);
  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(WHEEL_AREAS.map((a) => [a.key, editing?.scores[a.key] !== undefined ? formatScore(editing.scores[a.key]) : ""])),
  );
  // Lo escrito va por área (como en su Notion), debajo del puntaje de cada una; lo general, al final.
  const [texts, setTexts] = useState(() => noteByArea(editing?.note));
  const setAreaText = (key: string, v: string) => setTexts((t) => ({ ...t, byArea: { ...t.byArea, [key]: v } }));
  const [error, setError] = useState<string | null>(null);
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const step = (key: string, by: number) => {
    haptic("tap");
    setError(null);
    setScores((s) => {
      const cur = num(s[key]);
      const base = cur === null || Number.isNaN(cur) ? (last?.scores[key] ?? 5) : cur;
      const v = Math.min(10, Math.max(0, Math.round((base + (cur === null ? 0 : by)) * 2) / 2));
      return { ...s, [key]: formatScore(v) };
    });
  };
  const filled = WHEEL_AREAS.filter((a) => scores[a.key].trim() !== "").length;
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed: WheelScores = {};
        for (const a of WHEEL_AREAS) {
          const v = num(scores[a.key]);
          if (v === null) continue;
          if (Number.isNaN(v) || v < 0 || v > 10) return setError(`${a.key}: tiene que ser un número de 0 a 10.`);
          parsed[a.key] = Math.round(v * 10) / 10;
        }
        if (!Object.keys(parsed).length) return setError("Poné el puntaje de al menos un área.");
        if (!date || date > today) return setError("Elegí una fecha (hoy o antes).");
        const note = joinWheelNote(texts);
        const w: WheelDTO = { id: editing?.id ?? `nueva-${Date.now()}`, date, scores: parsed, note: note || null };
        onSaved(w);
        quiet(
          saveWheel(editing?.id ?? null, { date, scores: parsed, note: w.note }).then((r) => {
            if ("error" in r && r.error) notifyError(r.error);
          }),
        );
      }}
    >
      <label className="grid gap-1.5 text-[13px] font-medium">
        Fecha
        <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required className="max-w-48" />
      </label>
      <div className="grid gap-1">
        <div className="flex items-center justify-between text-[12.5px] text-muted">
          <span>De 0 a 10 · {filled} de {WHEEL_AREAS.length} áreas</span>
          {last && <span>Antes: {dayMonthYear(last.date)}</span>}
        </div>
        <ul className="grid">
          {WHEEL_AREAS.map((a) => {
            const v = num(scores[a.key]);
            return (
              <li key={a.key} className="grid gap-1.5 border-b border-line py-2.5 last:border-b-0">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-[14.5px] font-medium">{a.key}</span>
                  {last?.scores[a.key] !== undefined && <span className="font-mono text-[11.5px] text-muted tabular">antes {formatScore(last.scores[a.key])}</span>}
                  <span className="flex items-center rounded-full border border-line-strong">
                    <button type="button" onClick={() => step(a.key, -0.5)} aria-label={`Bajar ${a.key}`} className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:text-fg">
                      <Minus size={15} weight="bold" />
                    </button>
                    <input
                      value={scores[a.key]}
                      onChange={(e) => (setError(null), setScores((s) => ({ ...s, [a.key]: e.target.value.replace(/[^\d,.]/g, "").slice(0, 4) })))}
                      inputMode="decimal"
                      aria-label={`Puntaje de ${a.key}`}
                      placeholder="–"
                      className="w-12 bg-transparent text-center font-mono text-[16px] font-medium tabular outline-none placeholder:text-faint"
                    />
                    <button type="button" onClick={() => step(a.key, 0.5)} aria-label={`Subir ${a.key}`} className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:text-fg">
                      <Plus size={15} weight="bold" />
                    </button>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2">
                  {v !== null && !Number.isNaN(v) && <div className="h-full rounded-full bg-[var(--mod)]" style={{ width: `${Math.min(10, Math.max(0, v)) * 10}%` }} />}
                </div>
                <textarea
                  value={texts.byArea[a.key] ?? ""}
                  onChange={(e) => setAreaText(a.key, e.target.value)}
                  aria-label={`Qué escribiste sobre ${a.key}`}
                  lang="es"
                  spellCheck
                  rows={2}
                  placeholder={`Cómo estás en ${a.key.toLowerCase()} y por qué ese puntaje…`}
                  className={cx(AREA_TEXT, "max-h-80 min-h-16 [field-sizing:content]")}
                />
              </li>
            );
          })}
        </ul>
      </div>
      <label className="grid gap-1.5 text-[13px] font-medium">
        Notas generales <span className="font-normal text-muted">(opcional)</span>
        <textarea
          value={texts.intro}
          onChange={(e) => setTexts((t) => ({ ...t, intro: e.target.value }))}
          rows={3}
          lang="es"
          spellCheck
          placeholder="Qué cambió, qué querés mejorar…"
          className={cx(AREA_TEXT, "min-h-20 [field-sizing:content] max-h-80")}
        />
      </label>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <Button type="submit" variant="accent">
        {editing ? "Guardar cambios" : "Guardar rueda"}
      </Button>
      {editing && <p className="text-center text-[12px] text-muted">{formatLong(editing.date, today)}</p>}
    </form>
  );
}

/**
 * Lo que escribió en una rueda, área por área, con el puntaje y cuánto cambió contra la
 * anterior (pedido de Facu, 2026-11-14: en Notion cada fecha era una página con su texto).
 */
function WheelReading({ w, before, onEdit }: { w: WheelDTO; before: WheelDTO | null; onEdit: () => void }) {
  const parts = splitWheelNote(w.note);
  const avg = wheelAverage(w.scores);
  return (
    <div className="grid gap-3">
      <p className="font-mono text-[12px] text-muted tabular">
        Promedio {avg !== null ? formatScore(avg) : "–"}
        {before ? ` · contra ${dayMonthYear(before.date)}` : ""}
      </p>
      {parts.length === 0 && <p className="text-[14px] text-muted">Esta rueda no tiene nada escrito.</p>}
      {parts.map((p, i) => {
        const score = p.area ? w.scores[p.area] : undefined;
        const d = p.area ? scoreDelta(w.scores, before?.scores, p.area) : null;
        return (
          <section key={i} id={p.area ? areaAnchor(p.area) : undefined} className="scroll-mt-3 overflow-hidden rounded-2xl border border-line bg-surface transition-shadow duration-500">
            <h3 className="flex items-center gap-2 border-b border-line bg-[color-mix(in_oklab,var(--mod)_9%,var(--surface))] px-4 py-2.5">
              <span className="text-[15.5px] font-semibold">{p.area ?? "Notas generales"}</span>
              {score !== undefined && (
                <span className="ml-auto inline-flex h-7 min-w-9 items-center justify-center rounded-full bg-[var(--mod)] px-2 text-[14px] font-semibold text-on-accent tabular">
                  {formatScore(score)}
                </span>
              )}
              {d !== null && <span className={cx("w-10 text-right font-mono text-[12px] tabular", tone(d))}>{formatDelta(d)}</span>}
            </h3>
            <div className="grid gap-3 px-4 py-3.5">
              {p.blocks.map((b, k) => (
                <div key={k} className="grid gap-1">
                  {b.title && <p className="kicker">{b.title}</p>}
                  {b.text && <p className="max-w-[68ch] text-[15px] leading-relaxed whitespace-pre-line">{b.text}</p>}
                </div>
              ))}
            </div>
          </section>
        );
      })}
      <Button onClick={onEdit} className="justify-self-start">
        <NotePencil size={16} aria-hidden /> Editar esta rueda
      </Button>
    </div>
  );
}

/** El principio de lo escrito, sin el rótulo de la primera área ("1. Salud."). */
const notePreview = (note: string) => note.replace(/^\s*\d+\.[^\n]*\n/, "").trim();

const AREA_TEXT = "w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-[16px] leading-relaxed outline-none focus:border-fg/50 pointer-fine:text-[14.5px]";

const areaAnchor = (area: string) => `rueda-area-${WHEEL_AREAS.findIndex((a) => a.key === area)}`;

/** Un área que, si la rueda tiene algo escrito, se toca para leer esa parte. */
function AreaRow({ area, onArea, className, children }: { area: string; onArea?: (area: string) => void; className?: string; children: React.ReactNode }) {
  if (!onArea) return <div className={className}>{children}</div>;
  return (
    <button type="button" onClick={() => onArea(area)} title={`Leer lo que escribiste sobre ${area}`} className={cx("tap-tint rounded-md text-left hover:bg-surface-2", className)}>
      {children}
    </button>
  );
}
