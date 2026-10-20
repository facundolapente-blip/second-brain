"use client";

import { useSwap } from "@/components/motion";
import { useSafeTransition } from "@/components/safe-action";
import Link from "next/link";
import { useOptimistic, useState } from "react";
import {
  ArrowCounterClockwise,
  CheckCircle,
  DownloadSimple,
  PencilSimple,
  Plus,
  Trash,
  TrashSimple,
  type Icon,
} from "@phosphor-icons/react";
import { emptyTrash, purgeItem, restoreItem } from "@/lib/trash-actions";
import { PageHeader } from "@/components/page-header";
import { Button, ConfirmButton, cx } from "@/components/ui";

type TrashRow = { id: string; kind: string; label: string; module: string; deletedAt: string };
type ActRow = { id: string; action: string; kind: string; label: string; module: string; at: string };

const KIND: Record<string, string> = {
  transaction: "Movimiento",
  account: "Cuenta",
  category: "Categoría de gastos",
  template: "Plantilla",
  schedule: "Recurrente",
  project: "Presupuesto puntual",
  debt: "Deuda",
  goal: "Meta de ahorro",
  habit: "Hábito",
  habitCategory: "Categoría de hábitos",
  journal: "Entrada del journal",
  block: "Bloque del plan",
  task: "Tarea",
  keyResult: "Resultado clave",
  photo: "Foto",
  objective: "Objetivo",
  note: "Nota",
  import: "Importación",
  trash: "Papelera",
};

const MODULE_COLOR: Record<string, string> = {
  habitos: "var(--c-habitos)",
  journal: "var(--c-journal)",
  gastos: "var(--c-gastos)",
  plan: "var(--c-plan)",
  notas: "var(--c-notas)",
  datos: "var(--mod-inicio)",
};

const MODULE_NAME: Record<string, string> = { habitos: "Hábitos", journal: "Journal", gastos: "Gastos", plan: "Plan", notas: "Notas", datos: "Datos" };

const ACTION: Record<string, { label: string; icon: Icon }> = {
  created: { label: "Creaste", icon: Plus },
  updated: { label: "Editaste", icon: PencilSimple },
  deleted: { label: "Borraste", icon: Trash },
  restored: { label: "Restauraste", icon: ArrowCounterClockwise },
  purged: { label: "Borraste para siempre", icon: TrashSimple },
  imported: { label: "Importaste", icon: DownloadSimple },
  done: { label: "Completaste", icon: CheckCircle },
};

const dateFmt = new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", weekday: "long", day: "numeric", month: "long" });
const when = (iso: string) => dateFmt.format(new Date(iso)).replace(".", "");
const daysLeft = (iso: string) => Math.max(0, 30 - Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
/** "se va en 3 días", "se va en 1 día", "se va hoy". */
function leavesIn(iso: string) {
  const n = daysLeft(iso);
  return n === 0 ? "se va hoy" : n === 1 ? "se va en 1 día" : `se va en ${n} días`;
}

/** Historial de toda la app: la papelera (lo borrado, para restaurar) y la actividad. */
export function HistoryLog({
  tab,
  trash,
  activity,
  hasMore,
  limit,
}: {
  tab: "papelera" | "actividad";
  trash: TrashRow[];
  activity: ActRow[];
  hasMore: boolean;
  limit: number;
}) {
  const [items, removeOptimistic] = useOptimistic(trash, (state, id: string) => state.filter((t) => t.id !== id));
  const [pending, start] = useSafeTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<string>("todo");
  const shown = filter === "todo" ? items : items.filter((t) => t.module === filter);

  function restore(t: TrashRow) {
    start(async () => {
      removeOptimistic(t.id);
      const r = await restoreItem(t.id);
      setMsg(r.ok ? { ok: true, text: `Restauraste: ${t.label}` } : { ok: false, text: r.error });
    });
  }

  // Actividad agrupada por día.
  const days = new Map<string, ActRow[]>();
  for (const a of activity) {
    const k = dayFmt.format(new Date(a.at));
    days.set(k, [...(days.get(k) ?? []), a]);
  }

  const tabSwap = useSwap(`${tab}|${filter}`);
  return (
    <>
      <PageHeader
        title="Historial"
        kicker="Toda la app"
        tabs={
          <div className="flex gap-6 border-b border-line">
            {(["papelera", "actividad"] as const).map((t) => (
              <Link
                key={t}
                href={t === "papelera" ? "/historial" : "/historial?ver=actividad"}
                aria-current={tab === t ? "page" : undefined}
                className={cx(
                  "-mb-px border-b-[1.5px] pb-3 text-[14px] transition-colors",
                  tab === t ? "border-fg font-medium text-fg" : "border-transparent text-muted hover:text-fg",
                )}
              >
                {t === "papelera" ? `Papelera${items.length ? ` (${items.length})` : ""}` : "Actividad"}
              </Link>
            ))}
          </div>
        }
      />
      <main key={`${tab}-${filter}`} className={cx("mx-auto grid max-w-3xl gap-4 px-4 pt-4 pb-16 lg:px-10 lg:pt-6", tabSwap)}>
        {msg && (
          <p
            role="status"
            className={cx(
              "reveal rounded-xl px-4 py-3 text-[13.5px]",
              msg.ok ? "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" : "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]",
            )}
          >
            {msg.text}
          </p>
        )}

        {tab === "papelera" ? (
          <>
            <p className="text-[13.5px] leading-relaxed text-muted">
              Lo que borrás en cualquier parte de la app queda acá 30 días. Restaurarlo lo vuelve a poner donde estaba, con todo
              lo que tenía (las marcas de un hábito, los movimientos de una categoría…).
            </p>
            {items.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {["todo", "gastos", "habitos", "journal", "plan", "notas"].map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={filter === m}
                    onClick={() => setFilter(m)}
                    className={cx(
                      "h-9 rounded-full border px-3 text-[13px] transition-colors",
                      filter === m ? "border-ink bg-ink text-on-ink" : "border-line-strong text-muted hover:text-fg",
                    )}
                  >
                    {m === "todo" ? "Todo" : MODULE_NAME[m]}
                  </button>
                ))}
                <span className="ml-auto">
                  <ConfirmButton confirmLabel="Tocá de nuevo: se borra todo para siempre" onConfirm={() => start(() => emptyTrash())}>
                    Vaciar papelera
                  </ConfirmButton>
                </span>
              </div>
            )}
            {shown.length === 0 ? (
              <div className="grid justify-items-center gap-2 rounded-[20px] border border-dashed border-line-strong py-12 text-center">
                <Trash size={26} className="text-muted" aria-hidden />
                <p className="text-[15px] font-medium">La papelera está vacía</p>
              </div>
            ) : (
              <ul className="grid divide-y divide-line rounded-[20px] border border-line bg-surface">
                {shown.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: MODULE_COLOR[t.module] }} />
                    <span className="grid min-w-0 flex-1">
                      <span className="line-clamp-2 text-[14.5px] font-medium break-words" title={t.label}>{t.label}</span>
                      <span className="text-[12px] text-muted">
                        {KIND[t.kind] ?? t.kind} · borrado {when(t.deletedAt)} · {leavesIn(t.deletedAt)}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1.5">
                      {/* En el celular, solo el ícono: con el texto, el nombre quedaba en diez letras. */}
                      <Button size="sm" disabled={pending} onClick={() => restore(t)} aria-label={`Restaurar ${t.label}`} title="Restaurar" className="max-sm:w-9 max-sm:px-0">
                        <ArrowCounterClockwise size={14} aria-hidden /> <span className="max-sm:hidden">Restaurar</span>
                      </Button>
                      <ConfirmButton confirmLabel="¿Seguro?" onConfirm={() => start(() => purgeItem(t.id))}>
                        <TrashSimple size={14} aria-hidden />
                        <span className="sr-only">Borrar para siempre</span>
                      </ConfirmButton>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : activity.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-muted">Todavía no hay actividad registrada.</p>
        ) : (
          <>
            {[...days].map(([day, list]) => (
              <section key={day} className="grid gap-1.5">
                <h2 className="kicker first-letter:uppercase">{day}</h2>
                <ul className="grid divide-y divide-line rounded-[20px] border border-line bg-surface">
                  {list.map((a) => {
                    const act = ACTION[a.action] ?? { label: a.action, icon: PencilSimple };
                    const Ico = act.icon;
                    return (
                      <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white"
                          style={{ background: MODULE_COLOR[a.module] ?? "var(--mod-inicio)" }}
                        >
                          <Ico size={15} weight="bold" aria-hidden />
                        </span>
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate text-[14px]">
                            <span className="text-muted">{act.label} </span>
                            {a.label}
                          </span>
                          <span className="text-[12px] text-muted">
                            {KIND[a.kind] ?? a.kind} · {when(a.at).split(", ").at(-1)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {hasMore && (
              <Link
                href={`/historial?ver=actividad&n=${limit + 300}`}
                className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong text-[14px] font-medium hover:bg-surface-2"
              >
                Ver más
              </Link>
            )}
          </>
        )}
      </main>
    </>
  );
}
