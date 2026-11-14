"use client";

import { useOptimistic } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowsLeftRight, Check, DotsThreeVertical, ShootingStar, Trash, TreeStructure } from "@phosphor-icons/react";
import { useSafeTransition } from "@/components/safe-action";
import { notifyDeleted, notifyError, notifyInfo } from "@/components/undo-toast";
import { TintedCard } from "@/components/tinted-card";
import { showContextMenu } from "@/components/context-menu";
import { useHoldMenu } from "@/components/hold-menu";
import { haptic } from "@/components/haptics";
import { cx } from "@/components/ui";
import { addDream, deleteDream, promoteDream, renameDream, setDreamKind, toggleDream } from "@/lib/offline/plan";
import { DREAM_KINDS, newClientId, type DreamDTO, type DreamKind } from "@/lib/plan-logic";
import { InlineAdd, InlineEdit } from "./tree-parts";

type Op = { type: "add"; dream: DreamDTO } | { type: "patch"; id: string; patch: Partial<DreamDTO> } | { type: "remove"; id: string };

function reduce(list: DreamDTO[], op: Op): DreamDTO[] {
  switch (op.type) {
    case "add":
      return [...list.filter((d) => d.id !== op.dream.id), op.dream];
    case "patch":
      return list.map((d) => (d.id === op.id ? { ...d, ...op.patch } : d));
    case "remove":
      return list.filter((d) => d.id !== op.id);
  }
}

const otherKind = (k: DreamKind): DreamKind => (k === "personal" ? "profesional" : "personal");

/**
 * "Sueños por cumplir" (pedido de Facu, 2026-11-14, de la publicidad del "sistema de vida"):
 * lo de largo plazo, personal o profesional, sin año. Se tildan al cumplirlos y, cuando uno
 * se vuelve concreto, "Pasarlo a objetivo" crea el objetivo grande del año que se mira (el
 * sueño queda en la lista, con un enlace a ese objetivo).
 */
export function Dreams({ dreams, year }: { dreams: DreamDTO[]; year: number }) {
  const router = useRouter();
  const [list, apply] = useOptimistic(dreams, reduce);
  const [, start] = useSafeTransition();
  const done = list.filter((d) => d.done).length;

  const add = (kind: DreamKind, title: string) => {
    const id = newClientId();
    const order = Math.max(0, ...list.map((d) => d.order)) + 1;
    start(async () => {
      apply({ type: "add", dream: { id, title, kind, done: false, order, objective: null } });
      const r = await addDream({ title, kind, clientId: id });
      if (!r.ok) notifyError(r.error);
    });
  };
  const toggle = (d: DreamDTO) => {
    haptic(d.done ? "tap" : "success");
    start(async () => {
      apply({ type: "patch", id: d.id, patch: { done: !d.done } });
      await toggleDream(d.id, !d.done);
    });
  };
  const rename = (d: DreamDTO, title: string) =>
    start(async () => {
      apply({ type: "patch", id: d.id, patch: { title } });
      await renameDream(d.id, title);
    });
  const move = (d: DreamDTO) =>
    start(async () => {
      const kind = otherKind(d.kind);
      apply({ type: "patch", id: d.id, patch: { kind } });
      await setDreamKind(d.id, kind);
    });
  const remove = (d: DreamDTO) =>
    start(async () => {
      apply({ type: "remove", id: d.id });
      await deleteDream(d.id);
      notifyDeleted("Sueño borrado");
    });
  const promote = (d: DreamDTO) =>
    start(async () => {
      const r = await promoteDream({ id: d.id, year });
      if (!r.ok) return notifyError(r.error);
      if ("id" in r && typeof r.id === "string") {
        notifyInfo(`"${d.title}" ya es un objetivo de ${year}`);
        router.push(`/plan/objetivos?anio=${year}&o=${r.id}`);
      } else notifyInfo("Pasa a objetivo cuando vuelva la señal");
    });
  const menu = (e: React.MouseEvent, d: DreamDTO) =>
    showContextMenu(
      e,
      [
        d.objective
          ? { label: `Ver el objetivo de ${d.objective.year}`, icon: <TreeStructure size={15} />, onSelect: () => router.push(`/plan/objetivos?anio=${d.objective!.year}&o=${d.objective!.id}`) }
          : { label: `Pasarlo a objetivo de ${year}`, icon: <TreeStructure size={15} />, onSelect: () => promote(d) },
        { label: d.done ? "Marcar como no cumplido" : "Marcar como cumplido", icon: <Check size={15} />, onSelect: () => toggle(d) },
        { label: `Pasar a ${d.kind === "personal" ? "profesionales" : "personales"}`, icon: <ArrowsLeftRight size={15} />, onSelect: () => move(d) },
        { label: "Borrar", icon: <Trash size={15} />, danger: true, onSelect: () => remove(d) },
      ],
      d.title,
    );

  return (
    <TintedCard
      icon={ShootingStar}
      title="Sueños por cumplir"
      className="mt-4"
      meta={list.length ? `${list.length} ${list.length === 1 ? "sueño" : "sueños"}${done ? ` · ${done} ${done === 1 ? "cumplido" : "cumplidos"}` : ""}` : "De largo plazo"}
    >
      {list.length === 0 && (
        <p className="max-w-[62ch] text-[14px] text-muted">
          Lo que querés lograr algún día, sin fecha. Cuando uno se vuelva concreto, pasalo a objetivo para partirlo en tareas.
        </p>
      )}
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        {DREAM_KINDS.map((k) => {
          const rows = list.filter((d) => d.kind === k.value);
          return (
            <section key={k.value} aria-label={`Sueños ${k.label.toLowerCase()}`} className="grid content-start">
              <h3 className="kicker mb-1">
                {k.label}
                {rows.length > 0 && <span className="ml-1.5 tabular">· {rows.length}</span>}
              </h3>
              <ul className="grid">
                {rows.map((d) => (
                  <DreamRow key={d.id} d={d} onToggle={() => toggle(d)} onRename={(t) => rename(d, t)} onPromote={() => promote(d)} onMenu={(e) => menu(e, d)} year={year} />
                ))}
              </ul>
              <InlineAdd placeholder={`Anotar un sueño ${k.value === "personal" ? "personal" : "profesional"}…`} onAdd={(t) => add(k.value, t)} onClose={() => {}} autoFocus={false} />
            </section>
          );
        })}
      </div>
    </TintedCard>
  );
}

function DreamRow({
  d,
  year,
  onToggle,
  onRename,
  onPromote,
  onMenu,
}: {
  d: DreamDTO;
  year: number;
  onToggle: () => void;
  onRename: (t: string) => void;
  onPromote: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const hold = useHoldMenu(onMenu);
  return (
    <li {...hold} className="group flex min-h-11 items-center gap-2 border-b border-line">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={d.done}
        aria-label={d.done ? `Marcar ${d.title} como no cumplido` : `Marcar ${d.title} como cumplido`}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full"
      >
        <span
          aria-hidden
          className={cx(
            "inline-flex size-[18px] items-center justify-center rounded-full border-2 transition-colors",
            d.done ? "border-[var(--st-done-line)] bg-[var(--st-done-line)] text-white" : "border-line-strong bg-surface",
          )}
        >
          {d.done && <Check size={10} weight="bold" className="check-draw" />}
        </span>
      </button>
      <InlineEdit value={d.title} onSave={onRename} done={d.done} className="text-[14.5px]" label="el sueño" />
      {d.objective ? (
        <Link
          href={`/plan/objetivos?anio=${d.objective.year}&o=${d.objective.id}`}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2.5 font-mono text-[11.5px] text-muted hover:text-fg"
          title="Es un objetivo grande: abrirlo"
        >
          <TreeStructure size={12} aria-hidden /> {d.objective.year}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onPromote}
          aria-label={`Pasar ${d.title} a objetivo de ${year}`}
          title={`Pasarlo a objetivo de ${year} (para partirlo en objetivos chicos y tareas)`}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
        >
          <TreeStructure size={16} aria-hidden />
        </button>
      )}
      <button
        type="button"
        onClick={onMenu}
        aria-label={`Opciones de ${d.title}`}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-surface-2 hover:text-fg lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
      >
        <DotsThreeVertical size={16} weight="bold" aria-hidden />
      </button>
    </li>
  );
}
