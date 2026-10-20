"use client";

import { useGastosNew } from "../new-action";
import { quiet, safeForm, useSafeTransition } from "@/components/safe-action";
import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CheckCircle, Handshake, Plus, User } from "@phosphor-icons/react";
import { StatTile, TintedCard } from "@/components/tinted-card";
import { EmptyBlock } from "../shared";
import { deleteDebt, reopenDebt, saveDebt, settleDebt, type ActionResult } from "@/lib/offline/finance";
import type { DebtDTO } from "@/lib/finance";
import { centsToInput, type AccountDTO, type CategoryDTO } from "@/lib/finance-logic";
import { formatShort, todayISO } from "@/lib/dates";
import { CURRENCIES, moneyCents } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button, ConfirmButton, cx, Field, Input, inputClass, Segmented, Sheet, type SheetHandle } from "@/components/ui";
import { GastosTabs } from "../gastos-nav";

type Dir = DebtDTO["direction"];

/** Plata prestada y debida: quién te debe, a quién le debés y cuándo se saldó. */
export function DebtsView({ debts, accounts, categories }: { debts: DebtDTO[]; accounts: AccountDTO[]; categories: CategoryDTO[] }) {
  const sheet = useRef<SheetHandle>(null);
  const settleSheet = useRef<SheetHandle>(null);
  const [editing, setEditing] = useState<DebtDTO | null>(null);
  const [settling, setSettling] = useState<DebtDTO | null>(null);
  const [key, setKey] = useState(0);
  const [showSettled, setShowSettled] = useState(false);

  const open = debts.filter((d) => !d.settledAt);
  const settled = debts.filter((d) => d.settledAt);
  const sum = (dir: Dir) => {
    const t: Record<string, number> = {};
    for (const d of open) if (d.direction === dir) t[d.currency] = (t[d.currency] ?? 0) + d.amountCents;
    return Object.entries(t).map(([c, v]) => moneyCents(v, c)).join(" + ") || "$ 0";
  };
  const count = (dir: Dir) => {
    const n = open.filter((d) => d.direction === dir).length;
    return n === 0 ? "Nada pendiente" : n === 1 ? "1 deuda abierta" : `${n} deudas abiertas`;
  };
  // Cabecera de cada persona: lo que queda con ella, neto por moneda.
  const personMeta = (list: DebtDTO[]) => {
    const t: Record<string, number> = {};
    for (const d of list) t[d.currency] = (t[d.currency] ?? 0) + (d.direction === "owed_to_me" ? d.amountCents : -d.amountCents);
    return Object.entries(t)
      .map(([c, v]) => (v === 0 ? `Quedan a mano en ${c}` : v > 0 ? `Te debe ${moneyCents(v, c)}` : `Le debés ${moneyCents(-v, c)}`))
      .join(" · ");
  };
  // Por persona: cuánto queda pendiente con cada uno.
  const people = new Map<string, DebtDTO[]>();
  for (const d of open) people.set(d.person, [...(people.get(d.person) ?? []), d]);

  // El "+" de la barra de abajo crea acá.
  useGastosNew(() => edit(null));
  function edit(d: DebtDTO | null) {
    setEditing(d);
    setKey((k) => k + 1);
    sheet.current?.open();
  }

  return (
    <>
      <PageHeader
        title="Deudas"
        tabs={<GastosTabs />}
        actions={
          <Button size="sm" className="max-lg:hidden" onClick={() => edit(null)}>
            <Plus size={15} weight="bold" aria-hidden /> Nueva
          </Button>
        }
      />
      <main className="mx-auto grid max-w-3xl gap-5 px-4 pt-2 pb-10 lg:px-10 lg:pt-6">
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            icon={ArrowDownLeft}
            label="Te deben"
            figure={<span className={sum("owed_to_me").length > 9 ? "text-[20px] sm:text-[26px]" : "text-[24px] sm:text-[30px]"}>{sum("owed_to_me")}</span>}
            sub={count("owed_to_me")}
          />
          <StatTile
            icon={ArrowUpRight}
            label="Debés"
            figure={<span className={sum("i_owe").length > 9 ? "text-[20px] sm:text-[26px]" : "text-[24px] sm:text-[30px]"}>{sum("i_owe")}</span>}
            sub={count("i_owe")}
          />
        </div>

        {open.length === 0 ? (
          <EmptyBlock title="Nada pendiente" icon={<Handshake size={22} weight="fill" />}>
            <p className="max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
              Cuando pagues algo por otro (&ldquo;la nafta, me pagan después&rdquo;) o te presten plata, anotalo acá. Al
              saldarlo podés cargar el movimiento de la devolución.
            </p>
            <Button size="sm" onClick={() => edit(null)}>
              <Plus size={14} weight="bold" aria-hidden /> Anotar una deuda
            </Button>
          </EmptyBlock>
        ) : (
          <div className="grid gap-4">
            {[...people].map(([person, list]) => (
              <TintedCard
                key={person}
                icon={User}
                title={person}
                meta={personMeta(list)}
                bodyClassName="gap-0! px-4! py-1! lg:px-5!"
              >
                <ul className="grid divide-y divide-line">
                  {list.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-2.5">
                      <button type="button" onClick={() => edit(d)} className="grid min-w-0 flex-1 text-left">
                        <span className={cx("text-[14.5px] font-medium", d.direction === "owed_to_me" ? "fin-income" : "")}>
                          {d.direction === "owed_to_me" ? "Te debe " : "Le debés "}
                          {moneyCents(d.amountCents, d.currency)}
                        </span>
                        <span className="truncate text-[12.5px] text-muted">
                          {formatShort(d.date)}
                          {d.note && ` · ${d.note}`}
                        </span>
                      </button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSettling(d);
                          setKey((k) => k + 1);
                          settleSheet.current?.open();
                        }}
                      >
                        Saldar
                      </Button>
                    </li>
                  ))}
                </ul>
              </TintedCard>
            ))}
          </div>
        )}

        {settled.length > 0 && (
          <TintedCard
            icon={CheckCircle}
            title="Saldadas"
            meta={settled.length === 1 ? "1 deuda" : `${settled.length} deudas`}
            action={
              <button type="button" onClick={() => setShowSettled((v) => !v)} aria-expanded={showSettled} className="tcard-pill press">
                {showSettled ? "Ocultar" : "Ver"}
              </button>
            }
            bodyClassName={showSettled ? "gap-0! px-4! py-1! lg:px-5!" : "hidden!"}
          >
            {showSettled && (
              <ul className="reveal grid divide-y divide-line">
                {settled.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-muted">
                    <span className="min-w-0 flex-1 basis-56 truncate text-[13.5px]">
                      {d.person} · {d.direction === "owed_to_me" ? "te devolvió" : "le pagaste"} {moneyCents(d.amountCents, d.currency)} ·{" "}
                      {formatShort(d.settledAt!)}
                    </span>
                    {d.hasSettleTx ? (
                      <ConfirmButton
                        className="h-9! shrink-0 px-3.5! text-[13px]!"
                        confirmLabel="Tocá de nuevo: también se borra el movimiento"
                        undo="Movimiento de la deuda borrado"
                        onConfirm={() => quiet(reopenDebt(d.id))}
                      >
                        Reabrir y borrar el movimiento
                      </ConfirmButton>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => quiet(reopenDebt(d.id))}>
                        Reabrir
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </TintedCard>
        )}
      </main>

      <Sheet ref={sheet} title={editing ? "Editar deuda" : "Nueva deuda"}>
        <DebtForm key={key} debt={editing} onDone={() => sheet.current?.close()} />
      </Sheet>
      <Sheet ref={settleSheet} title="Saldar">
        {settling && (
          <SettleForm key={key} debt={settling} accounts={accounts} categories={categories} onDone={() => settleSheet.current?.close()} />
        )}
      </Sheet>
    </>
  );
}

function DebtForm({ debt, onDone }: { debt: DebtDTO | null; onDone: () => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(safeForm(saveDebt), null);
  const [dir, setDir] = useState<Dir>(debt?.direction ?? "owed_to_me");
  const [, start] = useSafeTransition();
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="grid gap-4">
      {debt && <input type="hidden" name="id" value={debt.id} />}
      <Segmented
        name="direction"
        value={dir}
        onChange={setDir}
        options={[
          { value: "owed_to_me", label: "Me deben" },
          { value: "i_owe", label: "Debo" },
        ]}
      />
      <Field label="¿Quién?">
        <Input name="person" required maxLength={60} defaultValue={debt?.person} placeholder="Fede, Nico…" autoFocus={!debt} />
      </Field>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field label="Monto">
          <Input name="amount" inputMode="decimal" required defaultValue={centsToInput(debt?.amountCents)} placeholder="0" />
        </Field>
        <Field label="Moneda">
          <select name="currency" defaultValue={debt?.currency ?? "UYU"} className={inputClass}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Día">
          <Input name="date" type="date" defaultValue={debt?.date ?? todayISO()} />
        </Field>
        <Field label="Por qué">
          <Input name="note" maxLength={500} defaultValue={debt?.note ?? ""} placeholder="Nafta, cena…" />
        </Field>
      </div>
      {state && !state.ok && <p className="reveal text-[13px] text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
      {debt && (
        <ConfirmButton
            undo="Deuda borrada"
          onConfirm={() =>
            start(async () => {
              await deleteDebt(debt.id);
              onDone();
            })
          }
        >
          Borrar
        </ConfirmButton>
      )}
    </form>
  );
}

/** Saldar: con o sin cargar el movimiento de la devolución (o del pago). */
function SettleForm({
  debt,
  accounts,
  categories,
  onDone,
}: {
  debt: DebtDTO;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  onDone: () => void;
}) {
  const same = accounts.filter((a) => a.currency === debt.currency);
  const [accountId, setAccountId] = useState(same[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useSafeTransition();
  const back = debt.direction === "owed_to_me";
  // Lo que te devuelven entra como ingreso y lo que pagás sale como gasto (sin reintegros).
  const cats = categories.filter((c) => c.kind === (back ? "income" : "expense"));

  function go(withTx: boolean) {
    start(async () => {
      const r = await settleDebt(debt.id, withTx ? accountId : null, withTx && categoryId ? categoryId : null);
      if (r.ok) onDone();
      else setError(r.error);
    });
  }

  return (
    <div className="grid gap-4">
      <p className="text-[14px]">
        {back ? `${debt.person} te devolvió` : `Le pagaste a ${debt.person}`} <strong>{moneyCents(debt.amountCents, debt.currency)}</strong>.
      </p>
      {same.length > 0 ? (
        <>
          <Field label={back ? "¿A qué cuenta entró?" : "¿De qué cuenta salió?"}>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
              {same.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={back ? "Categoría (opcional)" : "Categoría del gasto (opcional)"}
            hint={back ? "Si fue algo que pagaste por él, elegí ese gasto: lo devuelto resta de ahí." : undefined}
          >
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
              <option value="">Sin categoría</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kind === "expense" && back ? `Reintegro de ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </Field>
          <Button disabled={pending} onClick={() => go(true)}>
            Saldar y cargar el movimiento
          </Button>
        </>
      ) : null}
      <Button variant="ghost" disabled={pending} onClick={() => go(false)}>
        Saldar sin cargar movimiento
      </Button>
      {error && <p className="reveal text-[13px] text-danger">{error}</p>}
    </div>
  );
}
