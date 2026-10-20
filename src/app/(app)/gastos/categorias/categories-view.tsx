"use client";

import Link from "next/link";
import { useRef } from "react";
import { ArrowDownLeft, ArrowUpRight, CaretRight, Plus } from "@phosphor-icons/react";
import { useGastosNew } from "../new-action";
import { TintedCard } from "@/components/tinted-card";
import type { CategoryDTO } from "@/lib/finance-logic";
import { PageHeader } from "@/components/page-header";
import { Button, cx } from "@/components/ui";
import { GastosTabs } from "../gastos-nav";
import { CategoryAvatar } from "../shared";
import { CategorySheet, type CategorySheetHandle } from "./category-sheet";

type Kind = "expense" | "income";

/** Todas las categorías; tocar una abre su pantalla (sus movimientos y Editar). */
export function CategoriesView({ categories }: { categories: CategoryDTO[] }) {
  const sheet = useRef<CategorySheetHandle>(null);
  const create = (kind: Kind = "expense") => sheet.current?.create(kind);
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
                    <Link
                      href={`/gastos/categorias/${c.id}`}
                      className="tap-tint flex min-h-16 w-full items-center gap-3.5 px-1 py-2.5 text-left transition-colors hover:bg-surface-2/70"
                    >
                      <CategoryAvatar category={c} />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[15px] font-medium">{c.name}</span>
                          {(c.business || c.pass) && (
                            <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                              {c.pass ? "Solo la diferencia" : "Trabajo"}
                            </span>
                          )}
                        </span>
                        <span className="text-[13px] text-muted">
                          {c.txCount === 0 ? "Sin movimientos" : c.txCount === 1 ? "1 movimiento" : `${c.txCount} movimientos`}
                        </span>
                      </span>
                      <CaretRight size={14} className="shrink-0 text-faint" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </TintedCard>
          );
        })}
      </main>

      <CategorySheet ref={sheet} />
    </>
  );
}
