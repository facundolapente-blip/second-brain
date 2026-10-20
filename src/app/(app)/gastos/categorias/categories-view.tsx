"use client";

import { useGastosNew } from "../new-action";
import { safeForm, useSafeTransition } from "@/components/safe-action";
import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Plus } from "@phosphor-icons/react";
import { TintedCard } from "@/components/tinted-card";
import { deleteCategory, saveCategory } from "@/lib/offline/finance";
import { FINANCE_ICONS, FinanceIcon } from "@/lib/finance-icons";
import { PALETTE, tone } from "@/lib/palette";
import type { CategoryDTO } from "@/lib/finance-logic";
import { PageHeader } from "@/components/page-header";
import { Button, ConfirmButton, cx, Field, Input, Segmented, Sheet, type SheetHandle } from "@/components/ui";
import { GastosTabs } from "../gastos-nav";
import { CategoryAvatar } from "../shared";

type Kind = "expense" | "income";
type Draft = { id?: string; name: string; kind: Kind; icon: string; color: string; txCount: number };

export function CategoriesView({ categories }: { categories: CategoryDTO[] }) {
  const sheet = useRef<SheetHandle>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", kind: "expense", icon: "Tag", color: "blue", txCount: 0 });
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(safeForm(saveCategory), null);
  const [, startTransition] = useSafeTransition();

  useEffect(() => {
    if (state?.ok) sheet.current?.close();
  }, [state]);

  function open(d: Draft) {
    setDraft(d);
    setFormKey((k) => k + 1);
    sheet.current?.open();
  }
  const create = (kind: Kind = "expense") => open({ name: "", kind, icon: "Tag", color: "blue", txCount: 0 });
  // El "+" de la barra de abajo crea acá.
  useGastosNew(() => create());

  const sections: { kind: Kind; title: string }[] = [
    { kind: "expense", title: "Gastos" },
    { kind: "income", title: "Ingresos" },
  ];

  return (
    <>
      <PageHeader
        title="Categorías"
        wide
        tabs={<GastosTabs />}
        actions={
          <Button variant="accent" size="sm" className="max-lg:hidden" onClick={() => create()}>
            <Plus size={16} weight="bold" /> Nueva categoría
          </Button>
        }
      />

      <main className="mx-auto grid max-w-3xl gap-4 px-4 pt-2 pb-6 lg:max-w-6xl lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-5 lg:px-10 lg:pt-6">
        {sections.map((s) => {
          const list = categories.filter((c) => c.kind === s.kind && !c.adjustment);
          return (
            <TintedCard
              key={s.kind}
              icon={s.kind === "expense" ? ArrowUpRight : ArrowDownLeft}
              title={s.title}
              meta={list.length === 1 ? "1 categoría" : `${list.length} categorías`}
              action={
                <button type="button" onClick={() => create(s.kind)} className="tcard-pill press">
                  <Plus size={13} weight="bold" aria-hidden /> Agregar
                </button>
              }
              bodyClassName="gap-0! px-4! pt-1! pb-2! lg:px-5!"
            >
              <ul className={cx("grid grid-cols-1 sm:grid-cols-2 sm:gap-x-8", s.kind === "income" && "lg:grid-cols-1")}>
                {list.map((c, i) => (
                  <li key={c.id} className="rise border-b border-line last:border-b-0" style={{ "--i": i } as React.CSSProperties}>
                    <button
                      type="button"
                      onClick={() => open({ id: c.id, name: c.name, kind: c.kind, icon: c.icon, color: c.color, txCount: c.txCount })}
                      className="flex min-h-16 w-full items-center gap-3.5 px-1 py-2.5 text-left transition-colors hover:bg-surface-2/70"
                    >
                      <CategoryAvatar category={c} />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-[15px] font-medium">{c.name}</span>
                        <span className="text-[13px] text-muted">
                          {c.txCount === 0 ? "Sin movimientos" : c.txCount === 1 ? "1 movimiento" : `${c.txCount} movimientos`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </TintedCard>
          );
        })}
      </main>

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
                  className={cx(
                    "chip-solid size-8 rounded-full transition-transform active:scale-90",
                    draft.color === p && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
                  )}
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
                  }}
                >
                  Eliminar categoría
                </ConfirmButton>
                {draft.txCount > 0 && (
                  <p className="text-center text-xs text-muted">
                    Si la eliminás, sus {draft.txCount} movimientos quedan sin clasificar.
                  </p>
                )}
              </>
            )}
          </div>
        </form>
      </Sheet>
    </>
  );
}
