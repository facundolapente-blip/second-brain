"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Plus } from "@phosphor-icons/react";
import { deleteCategory, saveCategory } from "@/lib/finance-actions";
import { FINANCE_ICONS, FinanceIcon } from "@/lib/finance-icons";
import { PALETTE, tone } from "@/lib/palette";
import type { CategoryDTO } from "@/lib/finance-logic";
import { PageHeader } from "@/components/page-header";
import { Button, ConfirmButton, cx, Field, Input, Segmented, Sheet, type SheetHandle } from "@/components/ui";
import { GastosTabs } from "../gastos-nav";
import { CategoryAvatar, Fab } from "../shared";

type Kind = "expense" | "income";
type Draft = { id?: string; name: string; kind: Kind; icon: string; color: string; txCount: number };

export function CategoriesView({ categories }: { categories: CategoryDTO[] }) {
  const sheet = useRef<SheetHandle>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", kind: "expense", icon: "Tag", color: "blue", txCount: 0 });
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(saveCategory, null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state?.ok) sheet.current?.close();
  }, [state]);

  function open(d: Draft) {
    setDraft(d);
    setFormKey((k) => k + 1);
    sheet.current?.open();
  }
  const create = (kind: Kind = "expense") => open({ name: "", kind, icon: "Tag", color: "blue", txCount: 0 });

  const sections: { kind: Kind; title: string }[] = [
    { kind: "expense", title: "Gastos" },
    { kind: "income", title: "Ingresos" },
  ];

  return (
    <>
      <PageHeader
        title="Categorías"
        tabs={<GastosTabs />}
        actions={
          <Button variant="accent" size="sm" className="max-lg:hidden" onClick={() => create()}>
            <Plus size={16} weight="bold" /> Nueva categoría
          </Button>
        }
      />

      <main className="mx-auto grid max-w-3xl gap-8 px-4 pt-2 lg:px-8 lg:pt-6">
        {sections.map((s) => {
          const list = categories.filter((c) => c.kind === s.kind);
          return (
            <section key={s.kind} className="grid gap-2">
              <div className="flex items-baseline justify-between px-2">
                <h2 className="text-[15px] font-semibold">{s.title}</h2>
                <button
                  type="button"
                  onClick={() => create(s.kind)}
                  className="text-[13px] text-accent-fg hover:underline"
                >
                  Agregar
                </button>
              </div>
              <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                {list.map((c, i) => (
                  <li key={c.id} className="rise" style={{ "--i": i } as React.CSSProperties}>
                    <button
                      type="button"
                      onClick={() => open({ id: c.id, name: c.name, kind: c.kind, icon: c.icon, color: c.color, txCount: c.txCount })}
                      className="flex w-full items-center gap-3.5 rounded-[12px] px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
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
            </section>
          );
        })}
      </main>

      <Fab onClick={() => create()} label="Nueva categoría" />

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
            <span className="text-[13px] font-medium text-muted">Color</span>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDraft({ ...draft, color: p })}
                  aria-label={p}
                  style={tone(p)}
                  className={cx(
                    "size-10 rounded-full bg-tone-solid shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition-transform duration-300 ease-spring active:scale-90",
                    draft.color === p && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
                  )}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <span className="text-[13px] font-medium text-muted">Ícono</span>
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

          {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}

          <div className="grid gap-2">
            <Button type="submit" variant="accent" disabled={pending} className="h-11">
              {pending ? "Guardando…" : draft.id ? "Guardar cambios" : "Crear categoría"}
            </Button>
            {draft.id && (
              <>
                <ConfirmButton
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
