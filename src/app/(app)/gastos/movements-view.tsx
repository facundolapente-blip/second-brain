"use client";

import { useChangeMotion } from "@/components/motion";
import { Tick, useFreshIds } from "./motion";
import { PendingFinance, useQueuedTxs } from "./pending-list";
import Link from "next/link";
import { useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowsClockwise, DotsThree, Handshake, ListChecks, MagnifyingGlass, ArrowUpRight, Bank, CaretRight, Copy, Plus, Receipt, SquaresFour, Tag, Wallet } from "@phosphor-icons/react";
import { StatTile, TintedCard } from "@/components/tinted-card";
import { Menu } from "@/components/menu";
import { formatShort } from "@/lib/dates";
import { moneyCents, moneyWhole } from "@/lib/format";
import {
  balanceByCurrency,
  centsToInput,
  txFlowEntries,
  dayLabel,
  groupByDay,
  periodIncludes,
  sortedCurrencies,
  touchesSelection,
  type AccountDTO,
  type CategoryDTO,
  type Period,
  type TemplateDTO,
  type TxDTO,
} from "@/lib/finance-logic";
import { PageHeader } from "@/components/page-header";
import { Button, cx } from "@/components/ui";
import { GastosTabs } from "./gastos-nav";
import { AccountChips, selectionLabel } from "./account-switcher";
import { useSelection } from "./selection";
import { QuickAdd } from "./quick-add";
import { Balance, CategoryMix, EmptyBlock, MiniBars, TotalsInline, TxRow, useLookups, type Lookups } from "./shared";
import { PeriodNav } from "./period-nav";
import { TxSheet, type TxOptimistic, type TxSheetHandle } from "./tx-sheet";
import { TxGestures, useTxActions } from "./tx-actions";
import { useGastosNew } from "./new-action";
import { NavDim, usePeriodSwipe } from "./period-step";
import { CategorySpend, SideBalances } from "./month-side";

/** Cambios que la lista muestra mientras el servidor guarda (la hoja ya se cerró). */
type Shown = { list: TxDTO[]; up: Record<string, true> };
function applyChange(st: Shown, c: TxOptimistic): Shown {
  if (c.type === "remove") {
    return { ...st, list: st.list.filter((t) => (c.id ? t.id !== c.id : t.installment?.group !== c.group)) };
  }
  const t = c.tx;
  const i = st.list.findIndex((x) => x.id === t.id);
  // Editado en el mismo día: queda en su lugar. Nuevo (o cambió de día): arriba de su día.
  const list = i >= 0 && st.list[i].date === t.date ? st.list.map((x) => (x.id === t.id ? t : x)) : [t, ...st.list.filter((x) => x.id !== t.id)];
  return { list, up: { ...st.up, [t.id]: true } };
}

const sig = (t: TxDTO) => `${t.kind}|${t.date}|${t.amountCents}|${t.accountId}|${t.title ?? ""}`;
const isLocal = (id: string) => id.startsWith("optimista-") || id.startsWith("cola-");

/**
 * Filas de verdad que llegaron del servidor en lugar de una optimista (mismo día,
 * monto, cuenta y título): no vuelven a entrar (ya estaban a la vista), solo se
 * iluminan apenas para decir "guardado".
 */
function useReplaced(rows: TxDTO[]): Set<string> {
  const key = rows.map((r) => r.id).join("|");
  const [st, setSt] = useState(() => ({ key, local: new Set(rows.filter((r) => isLocal(r.id)).map(sig)), replaced: new Set<string>() }));
  if (st.key !== key) {
    const before = new Set(st.key.split("|"));
    const replaced = new Set(rows.filter((r) => !isLocal(r.id) && !before.has(r.id) && st.local.has(sig(r))).map((r) => r.id));
    setSt({ key, local: new Set(rows.filter((r) => isLocal(r.id)).map(sig)), replaced });
    return replaced;
  }
  return st.replaced;
}

/** Atajo de teclado "N" para cargar un movimiento, salvo que se esté escribiendo o haya una hoja abierta. */
function useNewShortcut(onNew: () => void) {
  const cb = useRef(onNew);
  useEffect(() => {
    cb.current = onNew;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]") || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      cb.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function MovementsView({
  period,
  today,
  accounts,
  categories,
  templates,
  txs,
  uncategorized,
}: {
  period: Period;
  today: string;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  templates: TemplateDTO[];
  txs: TxDTO[];
  uncategorized: number;
}) {
  const router = useRouter();
  const { selection, scope, setSelection } = useSelection(accounts);
  const lk = useLookups(accounts, categories);
  const form = useRef<TxSheetHandle>(null);
  const hasAccounts = accounts.some((a) => !a.archived);
  useNewShortcut(() => hasAccounts && form.current?.create());
  // El "+" de la barra de abajo del celular.
  useGastosNew(() => (hasAccounts ? form.current?.create() : router.push("/gastos/cuentas?nueva=1")));
  // Deslizar de costado cambia de mes (o de año), como las flechas.
  const swipe = usePeriodSwipe();

  // Lo guardado aparece al instante (subiendo) y lo borrado se va; si el servidor falla, vuelve solo.
  const base = useMemo<Shown>(() => ({ list: txs, up: {} }), [txs]);
  const [shown, applyOptimistic] = useOptimistic(base, applyChange);
  // Lo cargado sin señal también se ve en su día ("sin subir").
  const queued = useQueuedTxs();
  const actions = useTxActions({ edit: (t) => form.current?.edit(t), onOptimistic: applyOptimistic });

  // ?nuevo=1 (atajo del ícono de la app o "Compartir"): abre la hoja directo; ?titulo= la precarga.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (!p.has("nuevo") || !hasAccounts) return;
    const card = accounts.find((a) => a.id === p.get("pagar") && !a.archived);
    if (card) {
      // Pagar la tarjeta: transferencia desde una cuenta de la misma moneda.
      const from = accounts.find((a) => !a.archived && a.type !== "card" && a.currency === card.currency);
      const cents = Number(p.get("monto"));
      form.current?.create({
        kind: "transfer",
        toAccountId: card.id,
        ...(from ? { accountId: from.id } : {}),
        title: `Pago ${card.name}`,
        amount: Number.isInteger(cents) && cents > 0 ? centsToInput(cents) : "",
      });
    } else {
      form.current?.create(p.get("titulo") ? { title: p.get("titulo")!.slice(0, 120) } : undefined);
    }
    for (const k of ["nuevo", "titulo", "pagar", "monto"]) p.delete(k);
    window.history.replaceState(null, "", `${window.location.pathname}${p.size ? `?${p}` : ""}`);
    // Solo al entrar con esos parámetros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccounts]);

  // "Todas" son las personales: lo de las cuentas de trabajo se ve solo si se eligen.
  const visible = useMemo(
    () => [...queued.filter((q) => periodIncludes(period, q.date)), ...shown.list].filter((t) => touchesSelection(t, scope)),
    [queued, shown.list, scope, period],
  );
  const replaced = useReplaced(visible);
  // Otro período: los datos entran desde ese lado; otras cuentas: fundido. Lo nuevo entra suave.
  const dataKey = `${period.from}|${period.to}|${scope?.join(",") ?? "todas"}`;
  const dataMotion = useChangeMotion(period.from, scope?.join(",") ?? "todas");
  // Lo recién cargado (o que cambió de día) entra en su día con un fondo que se apaga;
  // un día que no estaba, también. Al cambiar de período o de cuentas, no: ya desliza todo.
  const freshTx = useFreshIds(visible.map((t) => `${t.id}@${t.date}`), dataKey);
  const groups = useMemo(() => groupByDay(visible, scope, lk.currencyOf), [visible, scope, lk]);
  const freshDay = useFreshIds(groups.map((g) => g.date), dataKey);
  // Ingresos y gastos del mes por moneda (sin transferencias), para el resumen.
  const flows = useMemo(() => {
    const inc: Record<string, number> = {};
    const exp: Record<string, number> = {};
    // Por moneda y categoría, para la mezcla de las tarjetas de ingresos y gastos.
    const incCat: Record<string, Record<string, number>> = {};
    const expCat: Record<string, Record<string, number>> = {};
    // Transferencias y ajustes no cuentan; un reintegro resta del gasto; de la plata de
    // otra persona, solo la diferencia del mes; con "Personales", nada de trabajo.
    for (const f of txFlowEntries(visible, lk.category, lk.currencyOf, selection === null)) {
      const c = f.currency;
      const target = f.kind === "income" ? inc : exp;
      target[c] = (target[c] ?? 0) + f.cents;
      const byCat = ((f.kind === "income" ? incCat : expCat)[c] ??= {});
      const k = f.categoryId ?? "none";
      byCat[k] = (byCat[k] ?? 0) + f.cents;
    }
    return { inc, exp, incCat, expCat };
  }, [visible, lk, selection]);
  // Neto = ingresos − gastos (como Informes): sin transferencias ni ajustes de saldo.
  const net = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of new Set([...Object.keys(flows.inc), ...Object.keys(flows.exp)])) out[c] = (flows.inc[c] ?? 0) - (flows.exp[c] ?? 0);
    return out;
  }, [flows]);

  const balance = useMemo(
    () => balanceByCurrency(selection ? accounts : accounts.filter((a) => !a.archived), scope),
    [accounts, selection, scope],
  );
  const showAccount = selection === null || selection.length > 1;
  const isCurrent = periodIncludes(period, today);
  const netLabel = { month: "Neto del mes", year: "Neto del año", range: "Neto del período" }[period.kind] + (isCurrent && period.kind !== "range" ? " en curso" : "");
  // Informes trabaja por mes: el del final de lo que se ve (sin pasar de hoy).
  const reportMonth = (period.to > today ? today : period.to).slice(0, 7);

  return (
    <>
      <PageHeader
        title="Movimientos"
        wide
        tabs={<GastosTabs />}
        actions={
          <Button
            variant="accent"
            size="sm"
            className="max-lg:hidden"
            onClick={() => form.current?.create()}
            aria-keyshortcuts="N"
            title="Atajo: N"
          >
            <Plus size={16} weight="bold" /> Nuevo movimiento
          </Button>
        }
      />

      <main {...swipe} className="mx-auto max-w-3xl px-4 lg:max-w-6xl lg:px-10">
        {!hasAccounts ? (
          <EmptyBlock title="Empezá por tus cuentas" icon={<Bank size={22} weight="fill" />} className="mt-2 lg:mt-6">
            <p className="max-w-[46ch] text-sm leading-relaxed text-muted">
              Cada gasto o ingreso sale de una cuenta: efectivo, el banco, una tarjeta, tus dólares. Creá las que uses y
              después cargá movimientos.
            </p>
            <Link
              href="/gastos/cuentas?nueva=1"
              className="inline-flex h-11 items-center rounded-[4px] bg-ink px-4 text-sm font-medium text-on-ink transition-opacity hover:opacity-85"
            >
              Crear cuenta
            </Link>
          </EmptyBlock>
        ) : (
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-x-8">
            <section className="grid gap-4 pt-1 pb-4 lg:col-start-1 lg:row-start-1 lg:pt-6">
              <AccountChips accounts={accounts} selection={selection} onChange={setSelection} />
              <PendingFinance />
              <QuickAdd accounts={accounts.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name, currency: a.currency }))} />
              <div className="grid gap-3">
                <PeriodNav period={period} today={today} />
                <NavDim>
                  {/* Saldo (lo que queda, protagonista), ingresos y gastos del período: tarjetas de cifra. */}
                  <div
                    key={dataKey}
                    className={cx("grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]", dataMotion)}
                  >
                    <BalanceTile totals={balance} label={selectionLabel(accounts, selection)} net={net} netLabel={netLabel} flows={flows} />
                    <FlowTile label="Ingresos" totals={flows.inc} byCat={flows.incCat} lk={lk} kind="in" />
                    <FlowTile label="Gastos" totals={flows.exp} byCat={flows.expCat} lk={lk} kind="out" />
                  </div>
                </NavDim>
              </div>
            </section>

            {/* Celular: debajo del resumen. Computadora: panel lateral fijo con saldos y gasto por categoría. */}
            <aside className="grid content-start gap-4 pb-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-6 lg:pb-0">
              {/* Celular: lo pendiente a la vista y el resto en "Más" (en compu está en las pestañas). */}
              <div className="flex flex-wrap gap-2 empty:hidden">
                {uncategorized > 0 && (
                  <QuickLink
                    href="/gastos/sin-clasificar"
                    label={`${uncategorized} sin clasificar`}
                    icon={<Tag size={14} aria-hidden />}
                  />
                )}
                <div className="lg:hidden">
                  <Menu
                    align="left"
                    trigger={(toggle) => (
                      <button
                        type="button"
                        onClick={toggle}
                        className="press inline-flex h-10 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                      >
                        <DotsThree size={16} weight="bold" aria-hidden /> Más
                      </button>
                    )}
                    items={[
                      { label: "Buscar", icon: <MagnifyingGlass size={16} aria-hidden />, onSelect: () => router.push("/gastos/buscar") },
                      { label: "Recurrentes", icon: <ArrowsClockwise size={16} aria-hidden />, onSelect: () => router.push("/gastos/recurrentes") },
                      { label: "Plantillas", icon: <Copy size={16} aria-hidden />, onSelect: () => router.push("/gastos/plantillas") },
                      { label: "Deudas", icon: <Handshake size={16} aria-hidden />, onSelect: () => router.push("/gastos/deudas") },
                      { label: "Categorías", icon: <SquaresFour size={16} aria-hidden />, onSelect: () => router.push("/gastos/categorias") },
                      { label: "Revisar movimientos", icon: <ListChecks size={16} aria-hidden />, onSelect: () => router.push("/gastos/revisar") },
                    ]}
                  />
                </div>
              </div>
              <div className="hidden gap-4 lg:grid">
                <SideBalances accounts={accounts} selection={selection} onChange={setSelection} />
                <CategorySpend txs={visible} lk={lk} month={reportMonth} personal={selection === null} />
              </div>
            </aside>

            <TintedCard
              icon={Receipt}
              title="Movimientos"
              meta={visible.length === 1 ? "1 movimiento" : `${visible.length.toLocaleString("es-UY")} movimientos`}
              action={{ href: "/gastos/buscar", label: "Buscar" }}
              className="fin-clip lg:col-start-1 lg:row-start-2"
              bodyClassName="gap-0! px-4! pt-1! pb-2! lg:px-5!"
            >
            {groups.length === 0 ? (
              <NavDim>
                <EmptyBlock
                  inline
                  className="justify-items-center py-10 text-center"
                  icon={<Receipt size={18} weight="fill" />}
                  title={period.kind === "month" ? "No hay movimientos este mes" : period.kind === "year" ? "No hay movimientos este año" : "No hay movimientos en este período"}
                >
                  <p className="max-w-[34ch] text-sm text-muted">
                    {selection ? "En las cuentas elegidas. Probá con todas o con otras fechas." : "Cargá el primero con el botón de más."}
                  </p>
                </EmptyBlock>
              </NavDim>
            ) : (
              <NavDim>
              <div key={dataKey} className={cx("grid gap-4", dataMotion)}>
                {groups.map((g, gi) => {
                  const { label, relative } = dayLabel(g.date, today);
                  return (
                    <section
                      key={g.date}
                      aria-label={relative ? `${label}, ${formatShort(g.date)}` : label}
                      className={cx("rise", freshDay.has(g.date) && "reveal")}
                      style={{ "--i": Math.min(gi, 8) } as React.CSSProperties}
                    >
                      {/* En el celular el día queda pegado arriba mientras se recorre su lista. */}
                      <header className="z-10 -mx-4 flex items-baseline justify-between gap-3 border-b border-fg/80 bg-surface/92 px-4 pt-3 pb-2 backdrop-blur-md max-lg:sticky max-lg:top-[calc(4rem+env(safe-area-inset-top))] lg:mx-0 lg:px-0">
                        <h3 className="display text-[17px] first-letter:uppercase lg:text-[19px]">
                          {label}
                          {relative && <span className="kicker ml-2.5">{formatShort(g.date)}</span>}
                        </h3>
                        <TotalsInline totals={g.net} className="font-mono text-[12.5px] font-medium" />
                      </header>
                      <ul>
                        {g.txs.map((t) => {
                          const local = isLocal(t.id);
                          const status = t.id.startsWith("cola-") ? "sin-subir" : shown.up[t.id] ? "subiendo" : undefined;
                          return (
                            <li
                              key={t.id}
                              data-leave={t.id}
                              data-leave-group={t.installment?.group}
                              className={cx(
                                replaced.has(t.id)
                                  ? "fin-new"
                                  : freshTx.has(`${t.id}@${t.date}`) && (local ? "reveal" : "reveal fin-new"),
                              )}
                            >
                              <TxGestures tx={t} actions={actions} disabled={local}>
                                {(gp) => (
                                  <TxRow
                                    tx={t}
                                    lk={lk}
                                    selection={scope}
                                    showAccount={showAccount}
                                    status={status}
                                    onClick={local ? undefined : () => form.current?.edit(t)}
                                    gestures={local ? undefined : gp}
                                  />
                                )}
                              </TxGestures>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
              </NavDim>
            )}
            </TintedCard>
          </div>
        )}
      </main>

      <TxSheet
        ref={form}
        accounts={accounts}
        categories={categories}
        templates={templates}
        selection={selection}
        onOptimistic={applyOptimistic}
      />
    </>
  );
}

/** Cifra que entra en una tarjeta chica: las largas, un poco más chicas (siempre en un renglón). */
function fit(text: string, big?: boolean) {
  if (big) return text.length > 12 ? "text-[30px] lg:text-[36px]" : "text-[38px] lg:text-[44px]";
  return text.length > 8 ? "text-[22px] sm:text-[26px]" : "text-[26px] sm:text-[30px]";
}

/**
 * Saldo de las cuentas elegidas: la cifra protagonista (lo que queda), en tinta y sin
 * "+"; el neto del período chico debajo y lo que entró y salió en barras chicas.
 */
function BalanceTile({
  totals,
  label,
  net,
  netLabel,
  flows,
}: {
  totals: Record<string, number>;
  label: string;
  net: Record<string, number>;
  netLabel: string;
  flows: { inc: Record<string, number>; exp: Record<string, number> };
}) {
  const cur = sortedCurrencies(totals);
  const main = cur[0] ?? "UYU";
  const cents = totals[main] ?? 0;
  const inc = flows.inc[main] ?? 0;
  const exp = flows.exp[main] ?? 0;
  return (
    <StatTile
      icon={Wallet}
      label={`Saldo actual · ${label}`}
      className="col-span-2 sm:col-span-1"
      figure={
        // Al cargar o borrar un movimiento, el saldo cambia con un tic (no de golpe).
        <Tick value={cents} className={fit(moneyCents(cents, main), true)}>
          <Balance cents={cents} currency={main} hero />
        </Tick>
      }
      sub={
        <span className="grid gap-0.5">
          {cur.slice(1).map((c) => (
            <Tick key={c} value={totals[c]} className="figure text-[18px] text-fg">
              <Balance cents={totals[c]} currency={c} hero />
            </Tick>
          ))}
          {Object.keys(net).length > 0 && (
            <span className="flex flex-wrap items-baseline gap-x-2">
              {netLabel}
              <TotalsInline totals={net} whole className="font-mono text-[12.5px] font-medium" />
            </span>
          )}
        </span>
      }
    >
      {(inc > 0 || exp > 0) && (
        <MiniBars
          label={`Entró ${moneyWhole(inc, main)} y salió ${moneyWhole(exp, main)}`}
          rows={[
            { label: "entró", cents: inc, color: "var(--fin-in)" },
            { label: "salió", cents: exp, color: "var(--fin-out)" },
          ]}
        />
      )}
    </StatTile>
  );
}

/** Ingresos o gastos del período: flecha que entra o sale, así no depende del color. */
function FlowTile({
  label,
  totals,
  byCat,
  lk,
  kind,
}: {
  label: string;
  totals: Record<string, number>;
  byCat: Record<string, Record<string, number>>;
  lk: Lookups;
  kind: "in" | "out";
}) {
  const cur = sortedCurrencies(totals);
  const main = cur[0];
  return (
    <StatTile
      icon={kind === "in" ? ArrowDownLeft : ArrowUpRight}
      label={label}
      figure={
        main ? (
          <Tick value={totals[main]} className={fit(moneyWhole(totals[main], main))}>
            {moneyWhole(totals[main], main)}
          </Tick>
        ) : (
          <span className={fit(moneyCents(0))}>{moneyCents(0)}</span>
        )
      }
      sub={
        cur.length > 1 ? (
          <span className="tabular grid font-mono text-[13px] text-fg">
            {cur.slice(1).map((c) => (
              <Tick key={c} value={totals[c]}>
                {moneyWhole(totals[c], c)}
              </Tick>
            ))}
          </span>
        ) : main ? undefined : (
          "Nada todavía"
        )
      }
    >
      {main && byCat[main] && <CategoryMix parts={byCat[main]} lk={lk} what={`${label} por categoría`} />}
    </StatTile>
  );
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="press inline-flex h-10 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {icon}
      {label}
      <CaretRight size={12} weight="bold" aria-hidden />
    </Link>
  );
}
