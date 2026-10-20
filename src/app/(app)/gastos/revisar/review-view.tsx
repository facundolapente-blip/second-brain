"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowsLeftRight, Briefcase, Check, CheckCircle, HandCoins, MagnifyingGlass, Plus, Question } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { TintedCard } from "@/components/tinted-card";
import { Button, cx } from "@/components/ui";
import { useSafeTransition } from "@/components/safe-action";
import { notifyError, notifyInfo } from "@/components/undo-toast";
import { formatShort } from "@/lib/dates";
import {
  choicesFor,
  summarizeChoices,
  type ExchangePair,
  type PairChoice,
  type ReviewChoice,
  type ReviewData,
  type ReviewItem,
  type ReviewTx,
} from "@/lib/gastos-review-logic";
import { applyGastosReview, findCounterparts, searchReviewTx, undoGastosReview } from "@/lib/offline/gastos-review";
import { GastosTabs } from "../gastos-nav";
import { Amount, EmptyBlock } from "../shared";

type Cat = { id: string; name: string; kind: "expense" | "income" };

const choiceLabel = (c: ReviewChoice, t: Pick<ReviewTx, "kind">) =>
  c === "mama" ? (t.kind === "income" ? "Ingreso mamá" : "Gasto mamá") : c === "trabajo" ? "Del negocio" : c === "aporte" ? "Aporte mío" : "Dejar como está";

/** Cuántas filas se ven de entrada en cada grupo (el resto, con "Ver todos"). */
const FIRST = 12;

/**
 * Revisar movimientos: lo que hoy cuenta mal en los números personales, con una
 * propuesta para cada uno. Nada cambia hasta "Aplicar"; después se puede deshacer.
 */
export function ReviewView({
  data,
  categories,
  undo,
}: {
  data: ReviewData;
  categories: Cat[];
  undo: { at: string; count: number; batches: number } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useSafeTransition();
  // Lo que elegiste en cada fila (sin elegir = la propuesta). Sobrevive a aplicar otras filas.
  const [pairChoice, setPairChoice] = useState<Record<string, PairChoice>>({});
  const [choice, setChoice] = useState<Record<string, ReviewChoice>>({});
  // Lo aplicado sale de la lista al toque (hasta que llegue la lista nueva).
  const [done, setDone] = useState<Set<string>>(new Set());
  // Los agregados a mano desde la búsqueda van con "Plata de mamá".
  const [added, setAdded] = useState<ReviewItem[]>([]);
  const pairs = data.pairs.filter((p) => !done.has(p.key));
  const trabajo = data.trabajo.filter((i) => !done.has(i.tx.id));
  const loose = data.loose.filter((t) => !done.has(t.id));
  const mamaItems = useMemo(
    () => [...data.mama, ...added.filter((a) => !data.mama.some((m) => m.tx.id === a.tx.id))].filter((i) => !done.has(i.tx.id)),
    [data.mama, added, done],
  );
  const pc = (p: ExchangePair): PairChoice => pairChoice[p.key] ?? "transfer";
  const ch = (i: ReviewItem): ReviewChoice => choice[i.tx.id] ?? i.proposal;
  const summary = summarizeChoices(
    Object.fromEntries(pairs.map((p) => [p.key, pc(p)])),
    Object.fromEntries([...trabajo, ...mamaItems].map((i) => [i.tx.id, ch(i)])),
  );
  const nothing = !pairs.length && !loose.length && !trabajo.length && !mamaItems.length;

  const setMany = (items: ReviewItem[], pick: (i: ReviewItem) => ReviewChoice) =>
    setChoice((s) => ({ ...s, ...Object.fromEntries(items.map((i) => [i.tx.id, pick(i)])) }));

  function run(input: Parameters<typeof applyGastosReview>[0], ids: string[]) {
    startTransition(async () => {
      const r = await applyGastosReview(input);
      if (!r.ok) return notifyError(r.error);
      setDone((s) => new Set([...s, ...ids]));
      notifyInfo(r.changed ? `Listo: ${r.changed} ${r.changed === 1 ? "cambio aplicado" : "cambios aplicados"}` : "Listo: quedó como estaba");
      router.refresh();
    });
  }
  /** Aplicar todo lo que se ve. */
  function apply() {
    run(
      {
        pairs: pairs.map((p) => ({ outId: p.out.id, inId: p.in.id, choice: pc(p) })),
        items: [...trabajo, ...mamaItems].map((i) => ({ id: i.tx.id, choice: ch(i) })),
      },
      [...pairs.map((p) => p.key), ...trabajo.map((i) => i.tx.id), ...mamaItems.map((i) => i.tx.id)],
    );
  }
  /** Aplicar solo un par o un movimiento. */
  const applyPair = (p: ExchangePair) => run({ pairs: [{ outId: p.out.id, inId: p.in.id, choice: pc(p) }], items: [] }, [p.key]);
  const applyItem = (i: ReviewItem) => run({ pairs: [], items: [{ id: i.tx.id, choice: ch(i) }] }, [i.tx.id]);
  function revert() {
    startTransition(async () => {
      const r = await undoGastosReview();
      if (!r.ok) return notifyError(r.error);
      // Lo deshecho vuelve a la lista con lo que venga del servidor.
      setDone(new Set());
      notifyInfo("Se deshizo lo último");
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader title="Revisar movimientos" tabs={<GastosTabs />} />

      <main className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-2 pb-6 lg:max-w-4xl lg:px-8 lg:pt-6">
        <p className="text-[14px] leading-relaxed text-muted">
          Movimientos que hoy cuentan mal en tus números personales, cada uno con una propuesta. Cambiá lo que no corresponda:{" "}
          <b className="font-semibold text-fg">nada cambia hasta que toques Aplicar</b>, y después se puede deshacer. Los que revisás (también los
          que dejás como están) no vuelven a aparecer.
        </p>

        {undo && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-surface px-4 py-3">
            <span className="text-[13.5px]">
              Lo último que aplicaste:{" "}
              <b className="font-semibold">{undo.count === 0 ? "marcado como revisado" : undo.count === 1 ? "1 cambio" : `${undo.count} cambios`}</b>
              {undo.batches > 1 && <span className="text-muted"> · se puede seguir deshaciendo de a uno</span>}
            </span>
            <span className="flex flex-wrap gap-2">
              <Link
                href="/gastos/revisar/historial"
                className="press inline-flex h-9 items-center rounded-full border border-line-strong px-3.5 text-[13px] font-medium hover:bg-surface-2"
              >
                Ver todo lo que aplicaste
              </Link>
              <Button size="sm" variant="outline" onClick={revert} disabled={pending}>
                Deshacer lo último
              </Button>
            </span>
          </div>
        )}

        {nothing && (
          <EmptyBlock title="No queda nada para revisar" icon={<CheckCircle size={22} weight="fill" />}>
            <p className="text-sm text-muted">Si aparece algo nuevo que cuente mal, lo vas a ver acá.</p>
          </EmptyBlock>
        )}

        {(pairs.length > 0 || loose.length > 0) && (
          <TintedCard
            icon={ArrowsLeftRight}
            title="Cambios de dólares"
            meta={`${pairs.length === 1 ? "1 par" : `${pairs.length} pares`} · cargados como gasto + ingreso`}
            bodyClassName="gap-3!"
          >
            <p className="text-[13px] leading-relaxed text-muted">
              Pasar plata de pesos a dólares (o al revés) no es gasto ni ingreso. Unir cada par en una transferencia deja los saldos igual y saca un
              gasto que no existió. Fijate que las dos filas sean el mismo cambio.
            </p>
            <BulkRow
              label="Todos:"
              actions={[
                { label: "Unir todos", onClick: () => setPairChoice(Object.fromEntries(pairs.map((p) => [p.key, "transfer" as const]))) },
                { label: "Dejar como están", onClick: () => setPairChoice(Object.fromEntries(pairs.map((p) => [p.key, "keep" as const]))) },
              ]}
            />
            <Folded items={pairs} year={(p) => p.out.date.slice(0, 4)}>
              {(p: ExchangePair) => (
                <div key={p.key} className="grid gap-2.5 rounded-xl border border-line p-3">
                  <div className="grid gap-1.5">
                    <TxLine t={p.out} />
                    <TxLine t={p.in} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11.5px] text-muted">
                      {p.out.date === p.in.date ? "Mismo día" : `${formatShort(p.out.date)} y ${formatShort(p.in.date)}`} · $ {p.rate.toFixed(2).replace(".", ",")} por
                      dólar
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <ChoiceChips
                        value={pc(p)}
                        options={[
                          { value: "transfer", label: "Unir en una transferencia" },
                          { value: "keep", label: "Dejar como está" },
                        ]}
                        onChange={(v) => setPairChoice((s) => ({ ...s, [p.key]: v }))}
                      />
                      <ApplyOne onClick={() => applyPair(p)} disabled={pending} />
                    </span>
                  </div>
                </div>
              )}
            </Folded>
            {loose.length > 0 && (
              <div className="grid gap-2 border-t border-line pt-3">
                <span className="kicker">Sin pareja clara · {loose.length}</span>
                <p className="text-[12.5px] leading-relaxed text-muted">
                  Dicen &quot;cambio&quot; o &quot;pesos/dólares&quot; pero la otra mitad no apareció sola. Para cada uno:{" "}
                  <b className="font-semibold text-fg">Buscar la otra mitad</b> (y unirlas),{" "}
                  <b className="font-semibold text-fg">Sacar de los gastos</b> (era un cambio pero la otra mitad nunca se cargó: pasa a Ajuste de
                  saldo, el saldo no se mueve) o <b className="font-semibold text-fg">No es un cambio</b>.
                </p>
                {loose.map((t) => (
                  <LooseRow
                    key={t.id}
                    t={t}
                    pending={pending}
                    onJoin={(c) =>
                      run({ pairs: [t.kind === "expense" ? { outId: t.id, inId: c.id, choice: "transfer" } : { outId: c.id, inId: t.id, choice: "transfer" }], items: [] }, [t.id])
                    }
                    onPick={(choice) => run({ pairs: [], items: [{ id: t.id, choice }] }, [t.id])}
                  />
                ))}
              </div>
            )}
          </TintedCard>
        )}

        {trabajo.length > 0 && (
          <TintedCard
            icon={Briefcase}
            title="Negocio en cuentas personales"
            meta={trabajo.length === 1 ? "1 movimiento" : `${trabajo.length} movimientos`}
            bodyClassName="gap-3!"
          >
            <ul className="grid gap-1.5 text-[13px] leading-relaxed text-muted">
              <li>
                <b className="font-semibold text-fg">Del negocio:</b> compras y ventas de Arcano, discos, HouseMates. Van a la categoría Negocio y no
                cuentan en tus gastos ni ingresos personales.
              </li>
              <li>
                <b className="font-semibold text-fg">Aporte mío:</b> plata tuya que pusiste en el negocio (como los discos de 456 US$, si fue así). Va
                a Aporte al negocio y cuenta como gasto personal.
              </li>
              <li>
                <b className="font-semibold text-fg">Dejar como está:</b> sigue en su categoría (los sueldos en Trabajo, los vinilos que compraste para
                vos).
              </li>
            </ul>
            <BulkRow
              label="Todos:"
              actions={[
                { label: "Propuestas", onClick: () => setMany(trabajo, (i) => i.proposal) },
                { label: "Del negocio", onClick: () => setMany(trabajo, () => "trabajo") },
                { label: "Dejar como están", onClick: () => setMany(trabajo, () => "keep") },
              ]}
            />
            <ItemList items={trabajo} group="trabajo" value={ch} setChoice={setChoice} categories={categories} onApply={applyItem} pending={pending} />
          </TintedCard>
        )}

        <TintedCard
          icon={HandCoins}
          title="Plata de mamá"
          meta={mamaItems.length === 1 ? "1 movimiento" : `${mamaItems.length} movimientos`}
          bodyClassName="gap-3!"
        >
          <p className="text-[13px] leading-relaxed text-muted">
            Lo que te dio y lo que gastaste por ella van a <b className="font-semibold text-fg">Ingresos mamá</b> y{" "}
            <b className="font-semibold text-fg">Gastos mamá</b>: mueven el saldo, pero en los números cuenta solo la diferencia del mes (si te dio $
            2.000 y gastaste $ 1.800, son $ 200 de ingreso). Los regalos son plata de verdad: dejalos como están.
          </p>
          {mamaItems.length > 0 && (
            <>
              <BulkRow
                label="Todos:"
                actions={[
                  { label: "Propuestas", onClick: () => setMany(mamaItems, (i) => i.proposal) },
                  { label: "A mamá", onClick: () => setMany(mamaItems, () => "mama") },
                  { label: "Dejar como están", onClick: () => setMany(mamaItems, () => "keep") },
                ]}
              />
              <ItemList items={mamaItems} group="mama" value={ch} setChoice={setChoice} categories={categories} onApply={applyItem} pending={pending} />
            </>
          )}
          <AddSearch
            exclude={new Set([...data.trabajo, ...data.mama, ...added].map((i) => i.tx.id).concat(data.pairs.flatMap((p) => [p.out.id, p.in.id])))}
            onAdd={(t) => {
              setAdded((a) => [...a, { tx: t, proposal: "mama", reason: "Agregado a mano" }]);
              setChoice((c) => ({ ...c, [t.id]: "mama" }));
            }}
          />
        </TintedCard>

        {!nothing && (
          // Pegado abajo mientras se baja por la lista (arriba de la barra del celular).
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 rounded-2xl border bg-surface px-4 py-3 shadow-[var(--card-shadow)] lg:bottom-6">
            <span className="grid min-w-0 gap-0.5 text-[13px] leading-snug">
              <span className="font-medium text-fg">Aplicar todo lo que se ve, o de a uno con el botón de cada fila</span>
              <span className="text-muted">{summaryText(summary)}</span>
            </span>
            <Button variant="accent" onClick={apply} disabled={pending} className="shrink-0">
              {pending ? "Aplicando…" : summary.total ? `Aplicar todo (${summary.total})` : "Marcar todo como revisado"}
            </Button>
          </div>
        )}
      </main>
    </>
  );
}

function summaryText(s: ReturnType<typeof summarizeChoices>) {
  const parts = [
    s.transfers && `${s.transfers} a transferencia${s.transfers === 1 ? "" : "s"}`,
    s.trabajo && `${s.trabajo} al negocio`,
    s.aporte && `${s.aporte} a aporte`,
    s.mama && `${s.mama} a mamá`,
    s.other && `${s.other} a otra categoría`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Todo queda como está";
}

/**
 * Un cambio de moneda sin pareja: buscar la otra mitad (de la otra moneda, hasta 10
 * días) y unirlas, pasarlo a Ajuste de saldo o dejarlo (no era un cambio).
 */
function LooseRow({
  t,
  pending,
  onJoin,
  onPick,
}: {
  t: ReviewTx;
  pending: boolean;
  onJoin: (c: ReviewTx) => void;
  onPick: (choice: ReviewChoice) => void;
}) {
  const [found, setFound] = useState<{ tx: ReviewTx; rate: number | null; days: number }[] | null>(null);
  const [searching, startSearch] = useSafeTransition();
  const search = () => startSearch(async () => setFound(await findCounterparts(t.id)));
  return (
    <div className="grid gap-2.5 rounded-xl border border-line p-3">
      <TxLine t={t} />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={found ? () => setFound(null) : search}
          disabled={searching}
          aria-expanded={!!found}
          className={cx(
            "press inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[12.5px]",
            found ? "border-ink bg-ink font-medium text-on-ink" : "border-line-strong bg-surface hover:bg-surface-2",
          )}
        >
          <MagnifyingGlass size={12} weight="bold" aria-hidden /> {searching ? "Buscando…" : found ? "Cerrar la búsqueda" : "Buscar la otra mitad"}
        </button>
        <button
          type="button"
          onClick={() => onPick("ajuste")}
          disabled={pending}
          className="press inline-flex h-8 items-center rounded-full border border-line-strong bg-surface px-3 text-[12.5px] hover:bg-surface-2 disabled:opacity-50"
        >
          Sacar de los gastos
        </button>
        <button
          type="button"
          onClick={() => onPick("keep")}
          disabled={pending}
          className="press inline-flex h-8 items-center rounded-full border border-line-strong bg-surface px-3 text-[12.5px] hover:bg-surface-2 disabled:opacity-50"
        >
          No es un cambio
        </button>
      </div>
      {found && (
        <div className="grid gap-1.5 rounded-lg bg-surface-2 p-2.5">
          {found.length === 0 ? (
            <p className="text-[12.5px] text-muted">
              No hay movimientos de la otra moneda en 10 días. Si fue un cambio, la otra mitad nunca se cargó: usá &quot;Sacar de los gastos&quot;.
            </p>
          ) : (
            <>
              <span className="text-[12px] text-muted">De la otra moneda, hasta 10 días antes o después. Elegí la otra mitad:</span>
              {found.map(({ tx, rate, days }) => (
                <div key={tx.id} className="grid gap-1.5 rounded-lg border border-line bg-surface p-2.5">
                  <TxLine t={tx} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11.5px] text-muted">
                      {days === 0 ? "Mismo día" : `${days} ${days === 1 ? "día" : "días"} de diferencia`}
                      {rate !== null && ` · $ ${rate.toFixed(2).replace(".", ",")} por dólar`}
                    </span>
                    <button
                      type="button"
                      onClick={() => onJoin(tx)}
                      disabled={pending}
                      className="press inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-accent-fg/60 bg-accent-soft px-3 text-[12.5px] font-semibold text-accent-fg disabled:opacity-50"
                    >
                      Unir con este <ArrowRight size={12} weight="bold" aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Aplica solo esta fila con lo elegido. */
function ApplyOne({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-accent-fg/60 bg-accent-soft px-3 text-[12.5px] font-semibold text-accent-fg disabled:opacity-50"
    >
      Aplicar este <ArrowRight size={12} weight="bold" aria-hidden />
    </button>
  );
}

/** Botones para elegir lo mismo en todo un grupo. */
function BulkRow({ label, actions }: { label: string; actions: { label: string; onClick: () => void }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
      <span className="text-muted">{label}</span>
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => {
            a.onClick();
            notifyInfo(`Marcado: ${a.label.toLowerCase()} en todo el grupo. Se aplica con el botón de abajo.`);
          }}
          className="press inline-flex h-8 items-center rounded-full bg-surface-2 px-3 font-medium text-fg hover:bg-[color-mix(in_oklab,var(--surface-2)_80%,var(--text))]"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

/** Lista con el año cuando cambia; las primeras FIRST filas a la vista y el resto con "Ver todos". */
function Folded<T>({ items, year, children }: { items: T[]; year: (t: T) => string; children: (t: T) => React.ReactNode }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, FIRST);
  return (
    <div className="grid gap-2">
      {shown.map((t, i) => (
        <div key={i} className="grid gap-2">
          {(i === 0 || year(shown[i - 1]) !== year(t)) && <span className="kicker pt-1">{year(t)}</span>}
          {children(t)}
        </div>
      ))}
      {items.length > FIRST && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="press h-10 rounded-full border border-line-strong text-[13px] font-medium hover:bg-surface-2"
        >
          {all ? "Ver menos" : `Ver los ${items.length - FIRST} restantes`}
        </button>
      )}
    </div>
  );
}

/** Fecha, título, cuenta, categoría y monto de un movimiento. */
function TxLine({ t }: { t: ReviewTx }) {
  return (
    <div className="flex min-w-0 items-baseline gap-3">
      <span className="w-12 shrink-0 font-mono text-[11.5px] text-muted tabular">{formatShort(t.date)}</span>
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-[14px] font-medium">{t.title ?? <span className="text-muted">Sin título</span>}</span>
        <span className="truncate text-[12px] text-muted">
          {t.accountName} · {t.categoryName ?? "Sin clasificar"}
        </span>
      </span>
      <Amount cents={t.kind === "expense" ? -t.cents : t.cents} currency={t.currency} className="shrink-0 text-[14px]" />
    </div>
  );
}

function ItemList({
  items,
  group,
  value: valueOf,
  setChoice,
  categories,
  onApply,
  pending,
}: {
  items: ReviewItem[];
  group: "trabajo" | "mama";
  value: (i: ReviewItem) => ReviewChoice;
  setChoice: React.Dispatch<React.SetStateAction<Record<string, ReviewChoice>>>;
  categories: Cat[];
  onApply: (i: ReviewItem) => void;
  pending: boolean;
}) {
  return (
    <Folded items={items} year={(i) => i.tx.date.slice(0, 4)}>
      {(item: ReviewItem) => {
        const { tx, reason } = item;
        const value = valueOf(item);
        const opts = choicesFor(group, tx);
        const own = categories.filter((c) => c.kind === tx.kind);
        return (
          <div key={tx.id} className="grid gap-2.5 rounded-xl border border-line p-3">
            <TxLine t={tx} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto inline-flex items-center gap-1 text-[11.5px] text-muted">
                <Question size={12} aria-hidden /> {reason}
              </span>
              <ChoiceChips
                value={value.startsWith("cat:") ? "" : value}
                options={opts.map((o) => ({ value: o, label: choiceLabel(o, tx) }))}
                onChange={(v) => setChoice((s) => ({ ...s, [tx.id]: v }))}
              />
              <label className="sr-only" htmlFor={`cat-${tx.id}`}>
                Otra categoría
              </label>
              <select
                id={`cat-${tx.id}`}
                value={value.startsWith("cat:") ? value : ""}
                onChange={(e) => setChoice((s) => ({ ...s, [tx.id]: (e.target.value || opts[0]) as ReviewChoice }))}
                className={cx(
                  "h-8 max-w-[11rem] rounded-full border bg-surface px-2.5 text-[12.5px]",
                  value.startsWith("cat:") ? "border-fg/50 font-medium text-fg" : "border-line-strong text-muted",
                )}
              >
                <option value="">Otra categoría…</option>
                {own.map((c) => (
                  <option key={c.id} value={`cat:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ApplyOne onClick={() => onApply(item)} disabled={pending} />
            </div>
          </div>
        );
      }}
    </Folded>
  );
}

function ChoiceChips<T extends string>({ value, options, onChange }: { value: T | ""; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "press inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] transition-colors",
              on ? "border-ink bg-ink font-medium text-on-ink" : "border-line-strong bg-surface text-fg hover:bg-surface-2",
            )}
          >
            {on && <Check size={12} weight="bold" className="mr-1" aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Buscar cualquier otro movimiento (el súper que después te reintegró) y sumarlo a la lista. */
function AddSearch({ exclude, onAdd }: { exclude: Set<string>; onAdd: (t: ReviewTx) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ReviewTx[] | null>(null);
  const [pending, startTransition] = useSafeTransition();
  function search(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => setResults(await searchReviewTx(q)));
  }
  const shown = results?.filter((t) => !exclude.has(t.id)) ?? null;
  return (
    <div className="grid gap-2 border-t border-line pt-3">
      <form onSubmit={search} className="flex gap-2">
        <label htmlFor="buscar-mama" className="sr-only">
          Buscar otro movimiento
        </label>
        <span className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 focus-within:border-fg/40">
          <MagnifyingGlass size={15} className="shrink-0 text-faint" aria-hidden />
          <input
            id="buscar-mama"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Agregar otro: súper, farmacia…"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
            lang="es"
            spellCheck
          />
        </span>
        <Button type="submit" size="sm" variant="outline" disabled={pending || q.trim().length < 2} className="h-10">
          Buscar
        </Button>
      </form>
      {shown && (
        <ul className="grid gap-1">
          {shown.length === 0 && <li className="px-1 py-2 text-[13px] text-muted">No encontré otros movimientos con eso.</li>}
          {shown.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <TxLine t={t} />
              </span>
              <button
                type="button"
                onClick={() => onAdd(t)}
                aria-label={`Agregar ${t.title ?? "movimiento"}`}
                className="press inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong hover:bg-surface-2"
              >
                <Plus size={14} weight="bold" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center gap-1 text-[12px] text-muted">
        <ArrowRight size={12} aria-hidden /> De acá en adelante, al cargar algo así elegí directamente Gastos mamá o Ingresos mamá.
      </p>
    </div>
  );
}
