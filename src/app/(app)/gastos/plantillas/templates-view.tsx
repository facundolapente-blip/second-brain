"use client";

import { useRef, useState, useTransition } from "react";
import { DotsThree } from "@phosphor-icons/react";
import { moneyCents } from "@/lib/format";
import { deleteTemplate, renameTemplate } from "@/lib/finance-actions";
import type { AccountDTO, CategoryDTO, TemplateDTO } from "@/lib/finance-logic";
import { PageHeader } from "@/components/page-header";
import { Button, Field, IconButton, Input, Sheet, type SheetHandle } from "@/components/ui";
import { GastosTabs } from "../gastos-nav";
import { useSelection } from "../selection";
import { CategoryAvatar, EmptyBlock, useLookups } from "../shared";
import { TxSheet, type TxSheetHandle } from "../tx-sheet";

const KIND_LABEL = { expense: "Gasto", income: "Ingreso", transfer: "Transferencia" } as const;

/** Movimientos guardados para cargarlos de nuevo con un toque. */
export function TemplatesView({
  accounts,
  categories,
  templates,
}: {
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  templates: TemplateDTO[];
}) {
  const { selection } = useSelection(accounts);
  const lk = useLookups(accounts, categories);
  const form = useRef<TxSheetHandle>(null);
  const editSheet = useRef<SheetHandle>(null);
  const [editing, setEditing] = useState<TemplateDTO | null>(null);
  const [name, setName] = useState("");
  const [, startTransition] = useTransition();

  function describe(t: TemplateDTO): string {
    const parts: string[] = [KIND_LABEL[t.kind]];
    const acc = lk.account(t.accountId);
    if (t.amountCents) parts.push(moneyCents(t.amountCents, acc?.currency ?? "UYU"));
    if (t.kind === "transfer") parts.push(`${acc?.name ?? "?"} a ${lk.account(t.toAccountId)?.name ?? "?"}`);
    else if (acc) parts.push(acc.name);
    return parts.join(" · ");
  }

  return (
    <>
      <PageHeader title="Plantillas" tabs={<GastosTabs />} />

      <main className="mx-auto max-w-3xl px-4 pt-2 lg:px-8 lg:pt-6">
        {templates.length === 0 ? (
          <EmptyBlock title="Sin plantillas todavía">
            <p className="max-w-[48ch] text-sm leading-relaxed text-muted">
              Al cargar un movimiento que repetís seguido (el alquiler, la cuota del gimnasio, el café), marcá
              &ldquo;Guardar también como plantilla&rdquo;. Después lo cargás desde acá o desde los atajos del formulario.
            </p>
          </EmptyBlock>
        ) : (
          <ul className="grid gap-0.5">
            {templates.map((t, i) => (
              <li key={t.id} className="rise flex items-center gap-1" style={{ "--i": i } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => form.current?.fromTemplate(t)}
                  className="flex min-w-0 flex-1 items-center gap-3.5 rounded-[12px] px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <CategoryAvatar category={lk.category(t.categoryId)} transfer={t.kind === "transfer"} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-[15px] font-medium">{t.name}</span>
                    <span className="truncate text-[13px] text-muted">{describe(t)}</span>
                  </span>
                  <span className="text-[13px] font-medium text-accent-fg">Usar</span>
                </button>
                <IconButton
                  label="Opciones"
                  onClick={() => {
                    setEditing(t);
                    setName(t.name);
                    editSheet.current?.open();
                  }}
                >
                  <DotsThree size={20} weight="bold" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </main>

      <TxSheet ref={form} accounts={accounts} categories={categories} templates={[]} selection={selection} />

      <Sheet ref={editSheet} title="Plantilla">
        <form
          className="grid grid-cols-[minmax(0,1fr)] gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!editing) return;
            const id = editing.id;
            startTransition(() => renameTemplate(id, name));
            editSheet.current?.close();
          }}
        >
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
          </Field>
          <div className="grid gap-2">
            <Button type="submit" variant="accent" className="h-11">
              Guardar
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (!editing || !confirm(`¿Eliminar la plantilla "${editing.name}"?`)) return;
                const id = editing.id;
                startTransition(() => deleteTemplate(id));
                editSheet.current?.close();
              }}
            >
              Eliminar plantilla
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
