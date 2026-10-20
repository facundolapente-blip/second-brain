"use client";

import { useSafeTransition } from "@/components/safe-action";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Archive, CaretLeft, ChartPieSlice, Check, PencilSimple, Plus, Receipt, Wallet, X } from "@phosphor-icons/react";
import { StatTile, TintedCard } from "@/components/tinted-card";
import { archiveProject, deleteProject, setTransactionsProject } from "@/lib/offline/finance";
import type { AccountDTO, CategoryDTO, TxDTO } from "@/lib/finance-logic";
import { budgetState, convertCents, type ProjectDTO } from "@/lib/budget-logic";
import { formatShort } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import { tone } from "@/lib/palette";
import { FinanceIcon } from "@/lib/finance-icons";
import { Button, ConfirmButton, cx, IconButton, Sheet, type SheetHandle } from "@/components/ui";
import { MenuButton } from "@/components/shell";
import { CategoryAvatar, useLookups } from "../../shared";
import { ProjectForm } from "../budgets-view";

/** Un presupuesto puntual: cuánto va, en qué se fue y qué gastos le pertenecen. */
export function ProjectView({
  project: p,
  txs,
  candidates,
  accounts,
  categories,
  toUyu,
}: {
  project: ProjectDTO;
  txs: TxDTO[];
  candidates: TxDTO[];
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  /** Pesos por unidad de cada moneda (cotización de hoy). */
  toUyu: Record<string, number>;
}) {
  const router = useRouter();
  const lk = useLookups(accounts, categories);
  const editSheet = useRef<SheetHandle>(null);
  const addSheet = useRef<SheetHandle>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useSafeTransition();
  const [editKey, setEditKey] = useState(0);

  const st = budgetState(p.spentCents, p.amountCents, null);
  const pct = p.amountCents ? Math.min(100, Math.round((p.spentCents / p.amountCents) * 100)) : 0;
  // En la moneda del presupuesto: lo que está en otra se pasa con la cotización de hoy.
  const inProject = (t: TxDTO) => convertCents(t.amountCents, lk.currencyOf(t.accountId), p.currency, toUyu);
  const byCat = new Map<string | null, number>();
  for (const t of txs) {
    if (t.kind === "transfer") continue;
    // Un reintegro (ingreso asignado) baja su categoría.
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + (t.kind === "expense" ? inProject(t) : -inProject(t)));
  }
  const cats = [...byCat].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  const foreign = txs.some((t) => lk.currencyOf(t.accountId) !== p.currency);
  const maxCat = Math.max(1, ...cats.map(([, c]) => c));

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <>
      <header className="sticky top-0 z-20 bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-2 px-4 lg:min-h-20 lg:max-w-6xl lg:px-10">
          <MenuButton />
          <Link
            href="/gastos/presupuestos"
            className="hidden items-center gap-1 rounded-full px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg lg:inline-flex"
          >
            <CaretLeft size={14} aria-hidden /> Presupuestos
          </Link>
          <span className="ml-auto flex items-center gap-1">
            <IconButton
              label="Editar"
              onClick={() => {
                setEditKey((k) => k + 1);
                editSheet.current?.open();
              }}
            >
              <PencilSimple size={18} />
            </IconButton>
            <IconButton
              label={p.archived ? "Desarchivar" : "Archivar"}
              onClick={() => start(() => archiveProject(p.id, !p.archived))}
            >
              <Archive size={18} />
            </IconButton>
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-3xl grid-cols-1 gap-5 px-4 pt-2 pb-10 lg:max-w-6xl lg:grid-cols-12 lg:gap-8 lg:px-10">
        <section className="grid content-start gap-5 lg:col-span-5">
          <div className="flex items-center gap-3">
            <span style={tone(p.color)} className="chip-solid inline-flex size-12 shrink-0 items-center justify-center rounded-2xl">
              <FinanceIcon name={p.icon} size={24} weight="fill" aria-hidden />
            </span>
            <div className="grid min-w-0">
              <h1 className="display truncate text-[28px] lg:text-[34px]">{p.name}</h1>
              <p className="text-[13px] text-muted">
                {[p.startDate && formatShort(p.startDate), p.endDate && formatShort(p.endDate)].filter(Boolean).join(" al ") ||
                  "Sin fechas"}
                {p.archived && " · archivado"}
              </p>
            </div>
          </div>

          <StatTile
            icon={Wallet}
            label="Gastado"
            figure={<span className="text-[36px] lg:text-[40px]">{moneyCents(p.spentCents, p.currency)}</span>}
            unit={`de ${moneyCents(p.amountCents, p.currency)}`}
            sub={
              <>
                <span className={st === "over" ? "text-danger" : undefined}>
                  {st === "over"
                    ? `Te pasaste ${moneyCents(p.spentCents - p.amountCents, p.currency)}`
                    : `Quedan ${moneyCents(p.amountCents - p.spentCents, p.currency)} (${100 - pct}%)`}
                </span>
                {foreign && (
                  <span className="mt-1 block text-[12px]">
                    Lo que está en otra moneda se pasa a {p.currency === "UYU" ? "pesos" : p.currency === "USD" ? "dólares" : p.currency} con la
                    cotización de hoy.
                  </span>
                )}
              </>
            }
          >
            <span className="tmini-seg" role="img" aria-label={`Gastaste el ${pct}% del presupuesto`}>
              <span className="relative overflow-hidden">
                <span
                  className="bar-anim absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${pct}%`, background: st === "over" ? "var(--st-fail-line)" : "var(--head-chip)" }}
                />
              </span>
            </span>
          </StatTile>

          {cats.length > 0 && (
            <TintedCard icon={ChartPieSlice} title="En qué se fue" meta={cats.length === 1 ? "1 categoría" : `${cats.length} categorías`} bodyClassName="gap-2.5!">
              <ul className="grid gap-2.5">
                {cats.map(([id, cents]) => {
                  const c = lk.category(id);
                  return (
                    <li key={id ?? "none"} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 gap-y-1">
                      <CategoryAvatar category={c} size={26} />
                      <span className="truncate text-[13.5px]">{c?.name ?? "Sin clasificar"}</span>
                      <span className="tabular text-[13px]">{moneyCents(cents, p.currency)}</span>
                      <span className="col-start-2 col-end-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${(cents / maxCat) * 100}%` }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </TintedCard>
          )}
          {p.note && <p className="text-[14px] leading-relaxed text-muted">{p.note}</p>}
        </section>

        <TintedCard
          icon={Receipt}
          title="Movimientos"
          meta={txs.length === 1 ? "1 movimiento" : `${txs.length} movimientos`}
          action={
            <button
              type="button"
              className="tcard-pill press"
              onClick={() => {
                setPicked(new Set());
                addSheet.current?.open();
              }}
            >
              <Plus size={13} weight="bold" aria-hidden /> Sumar gastos
            </button>
          }
          className="self-start lg:col-span-7"
          bodyClassName={txs.length ? "gap-0! p-0!" : undefined}
        >
          {txs.length === 0 ? (
            <p className="text-[13.5px] leading-relaxed text-muted">
              Todavía no tiene gastos. Sumalos con &ldquo;Sumar gastos&rdquo; o, al cargar uno nuevo, elegí este presupuesto.
            </p>
          ) : (
            <ul className="grid divide-y divide-line">
              {txs.map((t) => (
                <TxLine key={t.id} t={t} lk={lk} equivalent={lk.currencyOf(t.accountId) !== p.currency ? moneyCents(inProject(t), p.currency) : null}>
                  <IconButton
                    label="Sacar de este presupuesto"
                    onClick={() => start(() => setTransactionsProject([t.id], null))}
                    disabled={pending}
                  >
                    <X size={15} />
                  </IconButton>
                </TxLine>
              ))}
            </ul>
          )}
        </TintedCard>
      </main>

      <Sheet ref={editSheet} title="Editar presupuesto">
        <div className="grid gap-4">
          <ProjectForm key={editKey} project={p} onDone={() => editSheet.current?.close()} />
          <ConfirmButton
            undo="Presupuesto borrado"
            onConfirm={() =>
              start(async () => {
                await deleteProject(p.id);
                router.push("/gastos/presupuestos");
              })
            }
          >
            Borrar presupuesto (los gastos quedan)
          </ConfirmButton>
        </div>
      </Sheet>

      <Sheet ref={addSheet} title="Sumar gastos">
        <div className="grid gap-3">
          <p className="text-[13px] text-muted">
            Gastos sin asignar {p.startDate || p.endDate ? "de esas fechas (y una semana antes y después)" : "de los últimos dos meses"}.
          </p>
          {candidates.length === 0 ? (
            <p className="py-6 text-[14px] text-muted">No hay gastos para sumar.</p>
          ) : (
            <ul className="grid divide-y divide-line border-y border-line">
              {candidates.map((t) => {
                const on = picked.has(t.id);
                return (
                  <li key={t.id}>
                    <button type="button" onClick={() => toggle(t.id)} className="flex w-full items-center gap-3 py-2.5 text-left">
                      <span
                        className={cx(
                          "inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                          on ? "border-accent bg-accent text-on-accent" : "border-line-strong",
                        )}
                      >
                        {on && <Check size={13} weight="bold" />}
                      </span>
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-[14px]">{t.title ?? lk.category(t.categoryId)?.name ?? "Sin título"}</span>
                        <span className="text-[12px] text-muted">
                          {formatShort(t.date)} · {lk.account(t.accountId)?.name}
                        </span>
                      </span>
                      <span className="tabular text-[14px]">{moneyCents(t.amountCents, lk.currencyOf(t.accountId))}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Button
            disabled={picked.size === 0 || pending}
            onClick={() =>
              start(async () => {
                await setTransactionsProject([...picked], p.id);
                addSheet.current?.close();
              })
            }
          >
            {picked.size ? `Sumar ${picked.size} ${picked.size === 1 ? "gasto" : "gastos"}` : "Elegí gastos"}
          </Button>
        </div>
      </Sheet>
    </>
  );
}

function TxLine({
  t,
  lk,
  equivalent,
  children,
}: {
  t: TxDTO;
  lk: ReturnType<typeof useLookups>;
  /** En otra moneda que el presupuesto: lo que cuenta ("≈ $ 4.050"). */
  equivalent?: string | null;
  children?: React.ReactNode;
}) {
  const c = lk.category(t.categoryId);
  const cur = lk.currencyOf(t.accountId);
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <CategoryAvatar category={c} size={32} />
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-[14px] font-medium">{t.title ?? c?.name ?? "Sin título"}</span>
        <span className="text-[12px] text-muted">
          {formatShort(t.date)} · {lk.account(t.accountId)?.name}
        </span>
      </span>
      <span className="grid shrink-0 justify-items-end">
        <span className={cx("tabular text-[14px]", t.kind === "income" && "fin-income")}>
          {t.kind === "income" ? "+ " : "− "}
          {moneyCents(t.amountCents, cur)}
        </span>
        {equivalent && <span className="tabular text-[11.5px] text-muted">≈ {equivalent}</span>}
      </span>
      {children}
    </li>
  );
}
