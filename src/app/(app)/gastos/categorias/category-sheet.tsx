"use client";

import { safeForm, useSafeTransition } from "@/components/safe-action";
import { useActionState, useEffect, useImperativeHandle, useRef, useState } from "react";
import { deleteCategory, saveCategory } from "@/lib/offline/finance";
import { FINANCE_ICONS, FinanceIcon } from "@/lib/finance-icons";
import { PALETTE, tone } from "@/lib/palette";
import type { CategoryDTO } from "@/lib/finance-logic";
import { Button, ConfirmButton, cx, Field, Input, Segmented, Sheet, type SheetHandle } from "@/components/ui";
import { CategoryAvatar } from "../shared";

type Kind = "expense" | "income";
export type CategoryDraft = { id?: string; name: string; kind: Kind; icon: string; color: string; txCount: number; business?: boolean; pass?: boolean };
export type CategorySheetHandle = { open: (d: CategoryDraft) => void; create: (kind?: Kind) => void };

export const draftOf = (c: CategoryDTO): CategoryDraft => ({
  id: c.id,
  name: c.name,
  kind: c.kind,
  icon: c.icon,
  color: c.color,
  txCount: c.txCount,
  business: c.business,
  pass: c.pass,
});

/** Hoja para crear o editar una categoría (la usan Categorías y el detalle de cada una). */
export function CategorySheet({ ref, onDeleted }: { ref: React.Ref<CategorySheetHandle>; onDeleted?: () => void }) {
  const sheet = useRef<SheetHandle>(null);
  const [draft, setDraft] = useState<CategoryDraft>({ name: "", kind: "expense", icon: "Tag", color: "blue", txCount: 0 });
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(safeForm(saveCategory), null);
  const [, startTransition] = useSafeTransition();

  useEffect(() => {
    if (state?.ok) sheet.current?.close();
  }, [state]);

  function open(d: CategoryDraft) {
    setDraft(d);
    setFormKey((k) => k + 1);
    sheet.current?.open();
  }
  useImperativeHandle(ref, () => ({ open, create: (kind: Kind = "expense") => open({ name: "", kind, icon: "Tag", color: "blue", txCount: 0 }) }));

  return (
    <Sheet ref={sheet} title={draft.id ? "Editar categoría" : "Nueva categoría"}>
      <form key={formKey} action={action} className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {draft.id && <input type="hidden" name="id" value={draft.id} />}
        <input type="hidden" name="icon" value={draft.icon} />
        <input type="hidden" name="color" value={draft.color} />

        {!draft.id && (
          <Segmented
            name="kind"
            value={draft.kind}
            onChange={(kind) => setDraft({ ...draft, kind })}
            options={[
              { value: "expense", label: "Gasto" },
              { value: "income", label: "Ingreso" },
            ]}
          />
        )}

        <div className="flex items-end gap-3">
          <CategoryAvatar category={{ ...draft, id: "", order: 0, txCount: 0 }} />
          <Field label="Nombre" className="flex-1">
            <Input
              name="name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
              maxLength={40}
              placeholder={draft.kind === "income" ? "Sueldo, freelance…" : "Supermercado, nafta…"}
            />
          </Field>
        </div>

        <div className="grid gap-2">
          <span className="kicker">Color</span>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setDraft({ ...draft, color: p })}
                aria-label={p}
                style={tone(p)}
                className={cx("chip-solid size-8 rounded-full transition-transform active:scale-90", draft.color === p && "ring-2 ring-fg ring-offset-2 ring-offset-surface")}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <span className="kicker">Ícono</span>
          <div className="grid grid-cols-8 gap-1.5">
            {Object.keys(FINANCE_ICONS).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setDraft({ ...draft, icon: name })}
                aria-label={name}
                style={tone(draft.color)}
                className={cx(
                  "inline-flex aspect-square items-center justify-center rounded-full transition-colors",
                  draft.icon === name ? "bg-tone text-tone-fg ring-1 ring-[var(--tone-fg)]" : "text-muted hover:bg-surface-2",
                )}
              >
                <FinanceIcon name={name} size={19} weight={draft.icon === name ? "fill" : "regular"} />
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              name="pass"
              checked={!!draft.pass}
              onChange={(e) => setDraft({ ...draft, pass: e.target.checked, business: e.target.checked ? false : draft.business })}
              className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
            />
            <span className="grid gap-0.5">
              <span className="font-medium">Plata de otra persona</span>
              <span className="text-[12.5px] text-muted">
                Lo que te dan para comprarle algo a alguien (Gastos mamá, Ingresos mamá). Mueve el saldo, pero en los números cuenta solo la diferencia del
                mes: si te dieron $ 2.000 y gastaste $ 1.800, son $ 200 de ingreso.
              </span>
            </span>
          </label>
          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              name="business"
              checked={!!draft.business}
              disabled={!!draft.pass}
              onChange={(e) => setDraft({ ...draft, business: e.target.checked })}
              className="mt-0.5 size-5 shrink-0 accent-[var(--accent)] disabled:opacity-40"
            />
            <span className="grid gap-0.5">
              <span className="font-medium">De trabajo</span>
              <span className="text-[12.5px] text-muted">
                No cuenta en tus gastos ni ingresos personales (Inicio, Informes, presupuestos, meses de reserva), aunque salga de una cuenta personal.
              </span>
            </span>
          </label>
        </div>

        {state && !state.ok && <p className="reveal text-sm text-danger">{state.error}</p>}

        <div className="grid gap-2">
          <Button type="submit" variant="accent" disabled={pending} className="h-11">
            {pending ? "Guardando…" : draft.id ? "Guardar cambios" : "Crear categoría"}
          </Button>
          {draft.id && (
            <>
              <ConfirmButton
                undo="Categoría borrada"
                confirmLabel="Tocá de nuevo para eliminar"
                onConfirm={() => {
                  const id = draft.id!;
                  startTransition(() => deleteCategory(id));
                  sheet.current?.close();
                  onDeleted?.();
                }}
              >
                Eliminar categoría
              </ConfirmButton>
              {draft.txCount > 0 && <p className="text-center text-xs text-muted">Si la eliminás, sus {draft.txCount} movimientos quedan sin clasificar.</p>}
            </>
          )}
        </div>
      </form>
    </Sheet>
  );
}
