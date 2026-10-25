"use client";

import { forwardRef, useActionState, useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from "react";
import { safeForm, useSafeTransition } from "@/components/safe-action";
import { deleteKeyResult, deleteObjective, saveKeyResult, saveObjective } from "@/lib/offline/plan";
import { KR_STATUS, QUARTERS, type KeyResultDTO, type KrLinkOption, type KrStatus, type ObjectiveDTO, type Quarter } from "@/lib/plan-logic";
import { Button, ConfirmButton, cx, Field, Input, inputClass, Segmented, Sheet, type SheetHandle } from "@/components/ui";
import { PriorityPicker } from "../plan-ui";

const cleanTitle = (t: string) => t.replace(/^\d+\s+/, "");

/**
 * Crear o editar un objetivo grande: se escribe como venga (una frase o un párrafo); rol,
 * categoría, fecha y meta propia son opcionales. Borrarlo manda también todo su árbol a la papelera.
 */
export function ObjectiveForm({
  objective,
  year,
  roles,
  areas,
  onDone,
  onCreated,
  onDeleted,
}: {
  objective: ObjectiveDTO | null;
  year: number;
  roles: string[];
  areas: string[];
  onDone: () => void;
  /** Al crear uno nuevo (con señal): su id, para abrir su árbol. */
  onCreated?: (id: string) => void;
  /** Después de borrarlo (desde su árbol, volver a la lista). */
  onDeleted?: () => void;
}) {
  const [state, action, pending] = useActionState(safeForm(saveObjective), null);
  const [, startDelete] = useSafeTransition();
  const [priority, setPriority] = useState(objective?.priority ?? 0);
  const [status, setStatus] = useState<KrStatus>(objective?.status ?? "doing");
  const [more, setMore] = useState(false);
  const notify = useEffectEvent((id?: string) => {
    onDone();
    if (id && !objective) onCreated?.(id);
  });
  useEffect(() => {
    if (state?.ok) notify("id" in state ? (state.id as string | undefined) : undefined);
  }, [state]);
  return (
    <form action={action} className="grid gap-5">
      {objective && <input type="hidden" name="id" value={objective.id} />}
      <input type="hidden" name="year" value={objective?.year ?? year} />
      <Field label="¿Qué querés lograr?" hint={objective ? undefined : "Como te salga: una frase, un párrafo, una idea suelta. Después lo partís en pedazos."}>
        <textarea
          name="title"
          defaultValue={objective?.title}
          required
          maxLength={400}
          rows={3}
          autoFocus={!objective}
          lang="es"
          spellCheck
          placeholder="Quiero vivir de la música y sacar mi primer EP antes de fin de año"
          className={cx(inputClass, "min-h-24 resize-y py-2.5 leading-relaxed")}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rol (opcional)">
          <Input name="role" defaultValue={objective?.role ?? ""} maxLength={60} list="obj-roles" placeholder="DJ / Productor" />
        </Field>
        <Field label="Hasta (opcional)" className="min-w-0">
          <Input type="date" name="deadline" defaultValue={objective?.deadline ?? ""} className="min-w-0" />
        </Field>
      </div>
      <datalist id="obj-roles">
        {roles.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {/* Lo de siempre, plegado: categoría, prioridad, estado y meta propia. */}
      <button type="button" onClick={() => setMore(!more)} className="justify-self-start text-[13px] text-muted underline decoration-line-strong underline-offset-2 hover:text-fg">
        {more ? "Menos opciones" : "Más opciones"}
      </button>
      <div className={cx("grid gap-5", !more && "hidden")}>
        <Field label="Categoría">
          <Input name="area" defaultValue={objective?.area ?? ""} maxLength={60} list="obj-areas" placeholder="Música" />
        </Field>
        <datalist id="obj-areas">
          {areas.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <div className="grid gap-1.5">
          <span className="kicker">Prioridad</span>
          <PriorityPicker value={priority} onChange={setPriority} name="priority" />
        </div>
        <div className="grid gap-1.5">
          <span className="kicker">Estado</span>
          <Segmented
            name="status"
            value={status}
            onChange={setStatus}
            options={(["todo", "doing", "done", "closed"] as KrStatus[]).map((s) => ({ value: s, label: KR_STATUS[s].label }))}
          />
        </div>
        <div className="grid grid-cols-2 items-start gap-3">
          <Field label="Meta propia" hint="Opcional" className="min-w-0">
            <Input name="goal" inputMode="decimal" defaultValue={objective?.goal ?? ""} placeholder="4" className="min-w-0" />
          </Field>
          <Field label="Llevo" className="min-w-0">
            <Input name="progress" inputMode="decimal" defaultValue={objective?.progress ?? ""} className="min-w-0" />
          </Field>
        </div>
        <p className="-mt-2 text-[12.5px] text-muted">Sin objetivos más chicos, el avance es lo que llevás sobre la meta propia; con ellos, sale de sus tareas.</p>
      </div>

      {state && !state.ok && <p className="reveal text-sm text-danger">{state.error}</p>}
      <Button type="submit" variant="accent" disabled={pending} className="h-11">
        {pending ? "Guardando…" : objective ? "Guardar" : "Guardar y partirlo"}
      </Button>
      {objective && (
        <ConfirmButton
          undo="Objetivo borrado"
          onConfirm={() => {
            startDelete(() => deleteObjective(objective.id));
            onDone();
            onDeleted?.();
          }}
        >
          Borrar el objetivo{objective.keyResults.length ? ` con sus ${objective.keyResults.length} objetivos chicos` : ""}
        </ConfirmButton>
      )}
    </form>
  );
}

export type KrPreset = { objectiveId?: string; quarter?: Quarter };
export type KrSheetHandle = { open: (kr?: KeyResultDTO, preset?: KrPreset) => void };

/** Más opciones de un objetivo chico: trimestres, fecha, si se mide solo, estado, borrar. */
export const KrSheet = forwardRef<KrSheetHandle, { objectives: ObjectiveDTO[]; links: KrLinkOption[]; year: number; onDeleted?: () => void }>(function KrSheet(
  { objectives, links, year, onDeleted },
  ref,
) {
  const sheet = useRef<SheetHandle>(null);
  const [kr, setKr] = useState<KeyResultDTO | undefined>();
  const [preset, setPreset] = useState<KrPreset>({});
  const [key, setKey] = useState(0);
  useImperativeHandle(ref, () => ({
    open(k, p) {
      setKr(k);
      setPreset(p ?? {});
      setKey((n) => n + 1);
      sheet.current?.open();
    },
  }));
  return (
    <Sheet ref={sheet} title={kr ? "Objetivo chico" : "Nuevo objetivo chico"}>
      <KrForm
        key={key}
        kr={kr}
        preset={preset}
        objectives={objectives}
        links={links}
        year={year}
        onDone={() => sheet.current?.close()}
        onDeleted={() => {
          sheet.current?.close();
          onDeleted?.();
        }}
      />
    </Sheet>
  );
});

function KrForm({
  kr,
  preset,
  objectives,
  links,
  year,
  onDone,
  onDeleted,
}: {
  kr?: KeyResultDTO;
  preset: KrPreset;
  objectives: ObjectiveDTO[];
  links: KrLinkOption[];
  year: number;
  onDone: () => void;
  onDeleted: () => void;
}) {
  const [state, action, pending] = useActionState(safeForm(saveKeyResult), null);
  const [kind, setKind] = useState<"activity" | "habit">(kr?.kind ?? "activity");
  const [status, setStatus] = useState<KrStatus>(kr?.status ?? "todo");
  const [objectiveId, setObjectiveId] = useState(kr?.objectiveId ?? preset.objectiveId ?? objectives[0]?.id ?? "");
  const [deleting, startDelete] = useSafeTransition();
  const notify = useEffectEvent(onDone);
  useEffect(() => {
    if (state?.ok) notify();
  }, [state]);
  const quarters = kr?.quarters ?? (preset.quarter ? [preset.quarter] : []);
  const below = kr ? countBelow(objectives, kr) : 0;

  return (
    <form action={action} className="grid gap-5">
      {kr && <input type="hidden" name="id" value={kr.id} />}
      <input type="hidden" name="year" value={year} />
      <Field label="Nombre">
        <Input name="title" defaultValue={kr?.title} required maxLength={160} autoFocus={!kr} placeholder="Terminar 4 temas" />
      </Field>

      <Field label="Objetivo grande">
        <select name="objectiveId" value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)} className={cx(inputClass, "pr-8")}>
          {objectives.map((o) => (
            <option key={o.id} value={o.id}>
              {cleanTitle(o.title)}
            </option>
          ))}
          <option value="">Sin objetivo</option>
          <option value="__new">Nuevo objetivo...</option>
        </select>
      </Field>
      {objectiveId === "__new" && (
        <Field label="El objetivo nuevo">
          <Input name="newObjective" required maxLength={120} placeholder="Aprender de inversiones" />
        </Field>
      )}

      <div className="grid gap-1.5">
        <span className="kicker">Trimestres (opcional)</span>
        <div className="grid grid-cols-4 gap-1.5">
          {QUARTERS.map((q) => (
            <label
              key={q}
              className="flex h-11 cursor-pointer items-center justify-center rounded-[4px] border border-line text-[13px] font-medium text-muted transition-colors select-none has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent-fg"
            >
              <input type="checkbox" name="quarters" value={q} defaultChecked={quarters.includes(q)} className="sr-only" />
              {q}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <span className="kicker">Estado</span>
        <Segmented
          name="status"
          value={status}
          onChange={setStatus}
          options={(["todo", "doing", "done", "closed"] as KrStatus[]).map((s) => ({ value: s, label: KR_STATUS[s].label }))}
        />
      </div>

      <div className="grid gap-1.5">
        <span className="kicker">Tipo</span>
        <Segmented
          name="kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: "activity", label: "Actividad" },
            { value: "habit", label: "Hábito" },
          ]}
        />
      </div>

      <Field label="Se mide solo con (opcional)" hint="Sin tareas, el avance puede salir de un hábito, el saldo de una cuenta o una meta de ahorro.">
        <select name="link" defaultValue={kr?.link ?? ""} className={inputClass}>
          <option value="">A mano</option>
          {(["Hábitos", "Cuentas", "Metas de ahorro"] as const).map((g) => {
            const opts = links.filter((l) => l.group === g);
            return opts.length ? (
              <optgroup key={g} label={g}>
                {opts.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Progreso" className="min-w-0">
          <Input name="progress" inputMode="decimal" defaultValue={kr?.progress ?? ""} className="min-w-0" />
        </Field>
        <Field label="Meta" className="min-w-0">
          <Input name="goal" inputMode="decimal" defaultValue={kr?.goal ?? ""} className="min-w-0" />
        </Field>
        <Field label="Hasta" className="col-span-2 min-w-0 sm:col-span-1">
          <Input type="date" name="deadline" defaultValue={kr?.deadline ?? ""} className="min-w-0" />
        </Field>
      </div>
      <p className="-mt-2 text-[12.5px] text-muted">Con tareas, el avance sale de las tareas; progreso y meta valen cuando no tiene.</p>

      {state && !state.ok && (
        <p role="alert" className="reveal text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="grid gap-2">
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Guardando..." : kr ? "Guardar cambios" : "Crear"}
        </Button>
        {kr && (
          <ConfirmButton
            undo="Objetivo chico borrado"
            disabled={deleting}
            onConfirm={() =>
              startDelete(async () => {
                await deleteKeyResult(kr.id);
                onDeleted();
              })
            }
          >
            Borrar{below ? ` (con los ${below} que salen de él)` : ""}
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}

/** Cuántos objetivos más chicos salen de uno (para avisar al borrar). */
function countBelow(objectives: ObjectiveDTO[], kr: KeyResultDTO): number {
  const all = objectives.flatMap((o) => o.keyResults);
  let n = 0;
  let level = [kr.id];
  const seen = new Set(level);
  while (level.length) {
    const next = all.filter((k) => k.parentId && level.includes(k.parentId) && !seen.has(k.id));
    next.forEach((k) => seen.add(k.id));
    n += next.length;
    level = next.map((k) => k.id);
  }
  return n;
}
