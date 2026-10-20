"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowsLeftRight, Briefcase, CheckCircle, HandCoins, MagnifyingGlass, Plus, Question } from "@phosphor-icons/react";
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
import { applyGastosReview, searchReviewTx, undoGastosReview } from "@/lib/offline/gastos-review";
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
export function ReviewView({ data, categories, undo }: { data: ReviewData; categories: Cat[]; undo: { at: string; count: number } | null }) {
  const router = useRouter();
  const [pending, startTransition] = useSafeTransition();
  const [pairChoice, setPairChoice] = useState<Record<string, PairChoice>>(() =>
    Object.fromEntries(data.pairs.map((p) => [p.key, "transfer" as const])),
  );
  // Los agregados a mano desde la búsqueda van con "Plata de mamá".
  const [added, setAdded] = useState<ReviewItem[]>([]);
  const mamaItems = useMemo(() => [...data.mama, ...added.filter((a) => !data.mama.some((m) => m.tx.id === a.tx.id))], [data.mama, added]);
  const proposals = useMemo(
    () => Object.fromEntries([...data.trabajo, ...mamaItems].map((i) => [i.tx.id, i.proposal])) as Record<string, ReviewChoice>,
    [data.trabajo, mamaItems],
  );
  const [choice, setChoice] = useState<Record<string, ReviewChoice>>(() => ({ ...proposals }));
  const summary = summarizeChoices(pairChoice, choice);
  const nothing = !data.pairs.length && !data.loose.length && !data.trabajo.length && !mamaItems.length;

  const setMany = (items: ReviewItem[], pick: (i: ReviewItem) => ReviewChoice) =>
    setChoice((s) => ({ ...s, ...Object.fromEntries(items.map((i) => [i.tx.id, pick(i)])) }));

  function apply() {
    startTransition(async () => {
      const r = await applyGastosReview({
        pairs: data.pairs.map((p) => ({ outId: p.out.id, inId: p.in.id, choice: pairChoice[p.key] ?? "keep" })),
        items: [...data.trabajo, ...mamaItems].map((i) => ({ id: i.tx.id, choice: choice[i.tx.id] ?? "keep" })),
      });
      if (!r.ok) return notifyError(r.error);
      notifyInfo(r.changed ? `Listo: ${r.changed} ${r.changed === 1 ? "cambio aplicado" : "cambios aplicados"}` : "Listo: quedaron como estaban");
      setAdded([]);
      router.refresh();
    });
  }
  function revert() {
    startTransition(async () => {
      const r = await undoGastosReview();
      if (!r.ok) return notifyError(r.error);
      notifyInfo("Se deshizo la revisión");
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
              Última revisión: <b className="font-semibold">{undo.count === 1 ? "1 cambio" : `${undo.count} cambios`}</b> el {formatShort(undo.at.slice(0, 10))}
            </span>
            <Button size="sm" variant="outline" onClick={revert} disabled={pending}>
              Deshacer esta revisión
            </Button>
          </div>
        )}

        {nothing && (
          <EmptyBlock title="No queda nada para revisar" icon={<CheckCircle size={22} weight="fill" />}>
            <p className="text-sm text-muted">Si aparece algo nuevo que cuente mal, lo vas a ver acá.</p>
          </EmptyBlock>
        )}

        {(data.pairs.length > 0 || data.loose.length > 0) && (
          <TintedCard
            icon={ArrowsLeftRight}
            title="Cambios de dólares"
            meta={`${data.pairs.length === 1 ? "1 par" : `${data.pairs.length} pares`} · cargados como gasto + ingreso`}
            bodyClassName="gap-3!"
          >
            <p className="text-[13px] leading-relaxed text-muted">
              Pasar plata de pesos a dólares (o al revés) no es gasto ni ingreso. Unir cada par en una transferencia deja los saldos igual y saca un
              gasto que no existió. Fijate que las dos filas sean el mismo cambio.
            </p>
            <BulkRow
              label="Todos:"
              actions={[
                { label: "Unir", onClick: () => setPairChoice(Object.fromEntries(data.pairs.map((p) => [p.key, "transfer" as const]))) },
                { label: "Dejar como están", onClick: () => setPairChoice(Object.fromEntries(data.pairs.map((p) => [p.key, "keep" as const]))) },
              ]}
            />
            <Folded items={data.pairs} year={(p) => p.out.date.slice(0, 4)}>
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
                    <ChoiceChips
                      value={pairChoice[p.key] ?? "keep"}
                      options={[
                        { value: "transfer", label: "Unir en una transferencia" },
                        { value: "keep", label: "Dejar como está" },
                      ]}
                      onChange={(v) => setPairChoice((s) => ({ ...s, [p.key]: v }))}
                    />
                  </div>
                </div>
              )}
            </Folded>
            {data.loose.length > 0 && (
              <details className="rounded-xl border border-line px-3 py-2">
                <summary className="cursor-pointer py-1 text-[13.5px] font-medium">
                  {data.loose.length === 1 ? "1 parece un cambio" : `${data.loose.length} parecen cambios`} pero no tienen pareja clara
                </summary>
                <p className="pt-1 pb-2 text-[12.5px] text-muted">
                  No se tocan. Si alguno es un cambio, revisalo a mano en Buscar (la otra mitad puede haber quedado como ajuste de saldo).
                </p>
                <ul className="grid gap-1.5 pb-1">
                  {data.loose.map((t) => (
                    <li key={t.id}>
                      <a href={`/gastos/buscar?q=${encodeURIComponent(t.title ?? "")}`} className="block rounded-lg hover:bg-surface-2">
                        <TxLine t={t} />
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </TintedCard>
        )}

        {data.trabajo.length > 0 && (
          <TintedCard
            icon={Briefcase}
            title="Negocio en cuentas personales"
            meta={data.trabajo.length === 1 ? "1 movimiento" : `${data.trabajo.length} movimientos`}
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
                { label: "Propuestas", onClick: () => setMany(data.trabajo, (i) => i.proposal) },
                { label: "Del negocio", onClick: () => setMany(data.trabajo, () => "trabajo") },
                { label: "Dejar como están", onClick: () => setMany(data.trabajo, () => "keep") },
              ]}
            />
            <ItemList items={data.trabajo} group="trabajo" choice={choice} setChoice={setChoice} categories={categories} />
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
              <ItemList items={mamaItems} group="mama" choice={choice} setChoice={setChoice} categories={categories} />
            </>
          )}
          <AddSearch
            exclude={new Set([...data.trabajo, ...mamaItems].map((i) => i.tx.id).concat(data.pairs.flatMap((p) => [p.out.id, p.in.id])))}
            onAdd={(t) => {
              setAdded((a) => [...a, { tx: t, proposal: "mama", reason: "Agregado a mano" }]);
              setChoice((c) => ({ ...c, [t.id]: "mama" }));
            }}
          />
        </TintedCard>

        {!nothing && (
          // Pegado abajo mientras se baja por la lista (arriba de la barra del celular).
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 rounded-2xl border bg-surface px-4 py-3 shadow-[var(--card-shadow)] lg:bottom-6">
            <span className="min-w-0 text-[13px] leading-snug text-muted">{summaryText(summary)}</span>
            <Button variant="accent" onClick={apply} disabled={pending} className="shrink-0">
              {pending ? "Aplicando…" : summary.total ? `Aplicar ${summary.total}` : "Marcar como revisados"}
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

/** Botones para elegir lo mismo en todo un grupo. */
function BulkRow({ label, actions }: { label: string; actions: { label: string; onClick: () => void }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
      <span className="text-muted">{label}</span>
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
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
  choice,
  setChoice,
  categories,
}: {
  items: ReviewItem[];
  group: "trabajo" | "mama";
  choice: Record<string, ReviewChoice>;
  setChoice: React.Dispatch<React.SetStateAction<Record<string, ReviewChoice>>>;
  categories: Cat[];
}) {
  return (
    <Folded items={items} year={(i) => i.tx.date.slice(0, 4)}>
      {({ tx, reason }: ReviewItem) => {
        const value = choice[tx.id] ?? "keep";
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
