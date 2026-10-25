"use client";

import { useOptimistic } from "react";
import { useRouter } from "next/navigation";
import { Check, ListDashes, TreeStructure, X } from "@phosphor-icons/react";
import { useSafeTransition } from "@/components/safe-action";
import { notifyDeleted, notifyError, notifyInfo } from "@/components/undo-toast";
import { TintedCard } from "@/components/tinted-card";
import { cx } from "@/components/ui";
import { addMinorGoal, deleteMinorGoal, promoteMinorGoal, renameMinorGoal, toggleMinorGoal } from "@/lib/offline/plan";
import { newClientId, type MinorGoalDTO } from "@/lib/plan-logic";
import { InlineAdd, InlineEdit } from "./tree-parts";

type Op = { type: "add"; goal: MinorGoalDTO } | { type: "patch"; id: string; patch: Partial<MinorGoalDTO> } | { type: "remove"; id: string };

function reduce(list: MinorGoalDTO[], op: Op): MinorGoalDTO[] {
  switch (op.type) {
    case "add":
      return [...list.filter((g) => g.id !== op.goal.id), op.goal];
    case "patch":
      return list.map((g) => (g.id === op.id ? { ...g, ...op.patch } : g));
    case "remove":
      return list.filter((g) => g.id !== op.id);
  }
}

/**
 * "Otros objetivos" (2026-10-25): debajo del tablero, los objetivos que no se parten en
 * tareas (menos importantes, o que son un solo paso). Un renglón cada uno, se tildan al
 * lograrlos y, si después crecen, pasan a objetivo grande. Tildar no los cambia de lugar.
 */
export function MinorGoals({ goals, year }: { goals: MinorGoalDTO[]; year: number }) {
  const router = useRouter();
  const [list, apply] = useOptimistic(goals, reduce);
  const [, start] = useSafeTransition();
  const done = list.filter((g) => g.done).length;

  const add = (title: string) => {
    const id = newClientId();
    const order = Math.max(0, ...list.map((g) => g.order)) + 1;
    start(async () => {
      apply({ type: "add", goal: { id, title, done: false, order } });
      await addMinorGoal({ year, title, clientId: id });
    });
  };
  const toggle = (g: MinorGoalDTO) =>
    start(async () => {
      apply({ type: "patch", id: g.id, patch: { done: !g.done } });
      await toggleMinorGoal(g.id, !g.done);
    });
  const rename = (g: MinorGoalDTO, title: string) =>
    start(async () => {
      apply({ type: "patch", id: g.id, patch: { title } });
      await renameMinorGoal(g.id, title);
    });
  const remove = (g: MinorGoalDTO) =>
    start(async () => {
      apply({ type: "remove", id: g.id });
      await deleteMinorGoal(g.id);
      notifyDeleted("Objetivo borrado");
    });
  const promote = (g: MinorGoalDTO) =>
    start(async () => {
      apply({ type: "remove", id: g.id });
      const r = await promoteMinorGoal({ id: g.id });
      if (!r.ok) return notifyError(r.error);
      if ("id" in r && typeof r.id === "string") {
        notifyInfo(`"${g.title}" pasó a objetivo grande`);
        router.push(`/plan/objetivos?anio=${year}&o=${r.id}`);
      } else notifyInfo("Pasa a objetivo grande cuando vuelva la señal");
    });

  return (
    <TintedCard
      icon={ListDashes}
      title="Otros objetivos"
      className="mt-4"
      meta={list.length ? `${list.length} ${list.length === 1 ? "anotado" : "anotados"}${done ? ` · ${done} ${done === 1 ? "logrado" : "logrados"}` : ""}` : "Sin tareas que partir"}
    >
      {list.length === 0 && (
        <p className="max-w-[60ch] text-[14px] text-muted">
          Los que no necesitan partirse en tareas, o que son menos importantes. Anotalos acá en un renglón y tildalos cuando los logres.
        </p>
      )}
      {list.length > 0 && (
        <ul className="grid gap-x-8 lg:grid-cols-2">
          {list.map((g) => (
            <li key={g.id} className="group flex min-h-11 items-center gap-2 border-b border-line">
              <button
                type="button"
                onClick={() => toggle(g)}
                aria-pressed={g.done}
                aria-label={g.done ? `Destildar ${g.title}` : `Tildar ${g.title}`}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full"
              >
                <span
                  aria-hidden
                  className={cx(
                    "inline-flex size-[18px] items-center justify-center rounded-full border-2 transition-colors",
                    g.done ? "border-[var(--st-done-line)] bg-[var(--st-done-line)] text-white" : "border-line-strong bg-surface",
                  )}
                >
                  {g.done && <Check size={10} weight="bold" className="check-draw" />}
                </span>
              </button>
              <InlineEdit value={g.title} onSave={(t) => rename(g, t)} done={g.done} className="text-[14.5px]" label="el objetivo" />
              <button
                type="button"
                onClick={() => promote(g)}
                aria-label={`Pasar ${g.title} a objetivo grande`}
                title="Pasarlo a objetivo grande (para partirlo en objetivos chicos y tareas)"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
              >
                <TreeStructure size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => remove(g)}
                aria-label={`Borrar ${g.title}`}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-surface-2 hover:text-fg lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
              >
                <X size={13} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="max-w-xl">
        <InlineAdd placeholder="Anotar otro objetivo…" onAdd={add} onClose={() => {}} autoFocus={false} />
      </div>
    </TintedCard>
  );
}
