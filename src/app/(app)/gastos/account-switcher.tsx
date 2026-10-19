"use client";

import Link from "next/link";
import { Fragment, useRef, useState } from "react";
import { Briefcase, CaretDown, Check, Checks, GearSix } from "@phosphor-icons/react";
import { balanceByCurrency, scopeOf, type AccountDTO, type Selection } from "@/lib/finance-logic";
import { cx, Sheet, type SheetHandle } from "@/components/ui";
import { useSwap } from "@/components/motion";
import { AccountAvatar, Balance, TotalsInline } from "./shared";

/** Nombre corto de lo que se está mirando. */
export function selectionLabel(accounts: AccountDTO[], sel: Selection): string {
  if (sel === null) return accounts.some((a) => a.business) ? "Cuentas personales" : "Todas las cuentas";
  const work = accounts.filter((a) => a.business && !a.archived);
  if (work.length > 1 && sel.length === work.length && work.every((a) => sel.includes(a.id))) return "Cuentas de trabajo";
  if (sel.length === 1) return accounts.find((a) => a.id === sel[0])?.name ?? "1 cuenta";
  return `${sel.length} cuentas`;
}

/**
 * Botón con las cuentas elegidas y su saldo; abre la lista para elegir una,
 * varias o todas (como el selector de la app de Facu, con diseño propio).
 */
export function AccountSwitcher({
  accounts,
  selection,
  onChange,
  summary,
}: {
  accounts: AccountDTO[];
  selection: Selection;
  onChange: (s: Selection) => void;
  /** Dato a mostrar en lugar del saldo (en Movimientos, el neto del mes). */
  summary?: { label: string; totals: Record<string, number> };
}) {
  const sheet = useRef<SheetHandle>(null);
  const visible = accounts.filter((a) => !a.archived);
  const personal = personalIds(visible);
  const hasWork = visible.some((a) => a.business);
  const balance = balanceByCurrency(selection ? accounts : visible, scopeOf(selection, accounts));
  const chosen = selection ? accounts.filter((a) => selection.includes(a.id)) : visible.filter((a) => !a.business);

  function toggle(id: string) {
    const current = selection ?? personal;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    if (next.length === 0) return; // siempre queda al menos una
    onChange(isAll(next, personal) ? null : next);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => sheet.current?.open()}
        aria-haspopup="dialog"
        className="grid w-full gap-2 rounded-[6px] border border-line-strong px-4 py-3.5 text-left transition-colors hover:border-fg/40 hover:bg-surface-2"
      >
        <span className="flex items-center gap-2 text-[13px] text-muted">
          <span className="flex shrink-0 -space-x-1.5" aria-hidden>
            {chosen.slice(0, 3).map((a) => (
              <span key={a.id} className="rounded-[7px] ring-2 ring-bg">
                <AccountAvatar account={a} size={20} />
              </span>
            ))}
          </span>
          <span className="truncate font-medium text-fg">{selectionLabel(accounts, selection)}</span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1">
            Cambiar <CaretDown size={13} weight="bold" aria-hidden />
          </span>
        </span>
        {summary ? (
          <span className="grid gap-0.5">
            <span className="kicker">{summary.label}</span>
            <TotalsInline totals={summary.totals} align="start" className="figure text-[20px]" />
          </span>
        ) : (
          <span className="grid gap-0.5">
            <span className="kicker">Saldo actual</span>
            <TotalsInline totals={balance} align="start" balance className="figure text-[26px]" />
          </span>
        )}
      </button>

      <Sheet ref={sheet} title="Cuentas">
        <ul className="grid divide-y divide-line border-y border-line">
          {visible.map((a) => {
            const on = selection === null ? !a.business : selection.includes(a.id);
            return (
              <li key={a.id} className="flex items-center gap-1">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(a.id)}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-1 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <span
                    className={cx(
                      "inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                      on ? "border-accent bg-accent text-on-accent" : "border-line-strong",
                    )}
                  >
                    {on && <Check size={13} weight="bold" />}
                  </span>
                  <AccountAvatar account={a} size={34} />
                  <span className="grid min-w-0 flex-1">
                    <span className={cx("truncate text-[15px]", on && "font-medium")}>{a.name}</span>
                    <span className="font-mono text-[11px] text-muted">
                      {a.currency}
                      {a.business && " · Trabajo"}
                    </span>
                  </span>
                  <Balance cents={a.balanceCents} currency={a.currency} className="font-mono text-[13.5px] font-medium" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange(visible.length === 1 ? null : [a.id]);
                    sheet.current?.close();
                  }}
                  className="h-11 shrink-0 rounded-[4px] px-2.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  Solo esta
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={selection === null}
            className="inline-flex h-11 items-center gap-2 rounded-[4px] px-2 text-sm font-medium text-accent-fg transition-colors hover:bg-surface-2 disabled:opacity-40"
          >
            <Checks size={18} weight="bold" /> {hasWork ? "Solo las personales" : "Seleccionar todas"}
          </button>
          <Link
            href="/gastos/cuentas"
            className="inline-flex h-11 items-center gap-2 rounded-[4px] px-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <GearSix size={18} /> Administrar
          </Link>
        </div>
      </Sheet>
    </>
  );
}

/** Ids de las cuentas personales (las que entran en "Todas"). */
function personalIds(visible: AccountDTO[]): string[] {
  return visible.filter((a) => !a.business).map((a) => a.id);
}

/** ¿Son exactamente las de "Todas"? */
function isAll(ids: string[], personal: string[]): boolean {
  return ids.length === personal.length && personal.every((id) => ids.includes(id));
}

/**
 * Fila de cuentas a la vista: un toque muestra solo esa cuenta; con "Varias"
 * se suman o sacan de a una. La elección queda guardada (cookie), así Gastos
 * abre siempre en la cuenta que se usa.
 */
export function AccountChips({
  accounts,
  selection,
  onChange,
}: {
  accounts: AccountDTO[];
  selection: Selection;
  onChange: (s: Selection) => void;
}) {
  const visible = accounts.filter((a) => !a.archived);
  const personal = personalIds(visible);
  const work = visible.filter((a) => a.business);
  const workIds = work.map((a) => a.id);
  const onWork = work.length > 1 && selection !== null && isAll(selection, workIds);
  const [multi, setMulti] = useState(selection !== null && selection.length > 1 && !onWork);
  // Al pasar a "Varias" (o volver), el ícono de cada cuenta cambia por la casilla con un fundido;
  // la tilde da su golpe solo después de tocar (al cargar en "Varias", nada se mueve).
  const iconSwap = useSwap(multi ? "varias" : "una");
  const [touched, setTouched] = useState(false);

  function pick(id: string) {
    setTouched(true);
    if (!multi) {
      onChange(personal.length === 1 && personal[0] === id ? null : [id]);
      return;
    }
    const current = selection ?? personal;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    if (next.length === 0) return;
    onChange(isAll(next, personal) ? null : next);
  }

  const chip =
    "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-[13.5px] transition-[background-color,border-color,color] duration-200 active:scale-[0.98]";

  return (
    <div className="fin-scroll -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label="Cuentas a mostrar">
      <button
        type="button"
        aria-pressed={selection === null}
        onClick={() => {
          onChange(null);
          setMulti(false);
        }}
        className={cx(chip, selection === null ? "border-ink bg-ink font-medium text-on-ink" : "border-line-strong text-muted hover:text-fg")}
      >
        {work.length ? "Personales" : "Todas"}
      </button>
      {[...visible.filter((a) => !a.business), ...work].map((a, i, list) => {
        // Con "Trabajo" activo sus cuentas no se ven elegidas una por una (el botón
        // las representa), salvo en "Varias", donde sí se ve qué está tildado.
        const on = selection !== null && selection.includes(a.id) && (!onWork || multi);
        // Antes de la primera cuenta de trabajo, el botón que las junta.
        const workChip = a.business && !list[i - 1]?.business && work.length > 1;
        return (
          <Fragment key={a.id}>
          {workChip && (
            <button
              type="button"
              aria-pressed={onWork && !multi}
              onClick={() => {
                onChange(workIds);
                setMulti(false);
              }}
              className={cx(chip, onWork && !multi ? "border-ink bg-ink font-medium text-on-ink" : "border-line-strong text-fg hover:bg-surface-2")}
            >
              <Briefcase size={16} aria-hidden />
              Trabajo
            </button>
          )}
          <button
            key={a.id}
            type="button"
            aria-pressed={on}
            onClick={() => pick(a.id)}
            className={cx(chip, on ? "border-ink bg-ink font-medium text-on-ink" : "border-line-strong text-fg hover:bg-surface-2")}
          >
            {multi ? (
              <span
                key="casilla"
                className={cx(
                  "inline-flex size-4 items-center justify-center rounded-[4px] border",
                  on ? "border-on-ink" : "border-line-strong",
                  iconSwap,
                )}
              >
                {on && <Check size={11} weight="bold" className={touched ? "mark-pop" : undefined} />}
              </span>
            ) : (
              <span key="icono" className={cx("inline-flex", iconSwap)}>
                <AccountAvatar account={a} size={20} />
              </span>
            )}
            {a.name}
          </button>
          </Fragment>
        );
      })}
      <button
        type="button"
        aria-pressed={multi}
        onClick={() => setMulti((m) => !m)}
        className={cx(chip, multi ? "border-accent bg-accent-soft font-medium text-accent-fg" : "border-dashed border-line-strong text-muted hover:text-fg")}
      >
        <Checks size={15} weight="bold" aria-hidden />
        Varias
      </button>
    </div>
  );
}
