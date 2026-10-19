"use client";

import { useSafeTransition } from "@/components/safe-action";
import { useEffect, useRef, useState } from "react";
import { CaretDown, CheckCircle, Lightning } from "@phosphor-icons/react";
import { quickAdd, quickAddContext, suggestCategory } from "@/lib/offline/finance";
import { parseQuick, type QuickAccount } from "@/lib/smart-logic";
import { moneyCents } from "@/lib/format";
import { cx } from "@/components/ui";

type Context = NonNullable<Awaited<ReturnType<typeof quickAddContext>>>;

/**
 * Carga rápida escribiendo: "350 almuerzo itau", "+2450 disco santander ayer",
 * "usd 20 nafta". Mientras escribís muestra debajo qué va a cargar (tipo y monto,
 * cuenta, categoría y el día si no es hoy); cuenta y categoría se pueden cambiar con
 * un toque antes de "Cargar". La categoría la pone sola si ya clasificaste algo parecido.
 */
export function QuickAdd({ accounts, className }: { accounts: QuickAccount[]; className?: string }) {
  const [text, setText] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [pending, start] = useSafeTransition();
  const input = useRef<HTMLInputElement>(null);
  // Categorías y última cuenta por moneda: se piden la primera vez que se usa.
  const [ctx, setCtx] = useState<Context | null>(null);
  const asked = useRef(false);
  // Lo elegido a mano en la vista previa (undefined = lo detectado; categoría "" = sin clasificar).
  const [pickedAccount, setPickedAccount] = useState<string | undefined>(undefined);
  const [pickedCategory, setPickedCategory] = useState<string | undefined>(undefined);
  const [suggested, setSuggested] = useState<{ key: string; id: string | null } | null>(null);

  const p = text.trim() ? parseQuick(text, accounts) : null;
  const detectedAccount = p?.accountId ?? (ctx ? (ctx.lastAccount[p?.currency ?? "UYU"] ?? null) : null);
  const accountId = pickedAccount ?? detectedAccount;
  const acc = accountId ? accounts.find((a) => a.id === accountId) : undefined;
  const currency = pickedAccount ? acc?.currency : (p?.currency ?? acc?.currency);
  const suggestKey = p?.title ? `${p.kind}|${p.title}` : "";
  const detectedCategory = suggested && suggested.key === suggestKey ? suggested.id : null;
  const categoryId = pickedCategory !== undefined ? pickedCategory || null : detectedCategory;
  const categoryOptions = ctx?.categories.filter((c) => c.kind === p?.kind) ?? [];
  const category = categoryId ? ctx?.categories.find((c) => c.id === categoryId) : undefined;

  // La categoría que pondría el servidor (mismo clasificador), al dejar de escribir.
  useEffect(() => {
    if (!suggestKey) return;
    const [kind, title] = [suggestKey.slice(0, suggestKey.indexOf("|")), suggestKey.slice(suggestKey.indexOf("|") + 1)];
    let alive = true;
    const t = setTimeout(() => {
      suggestCategory(title, kind)
        .then((id) => {
          if (alive) setSuggested({ key: suggestKey, id });
        })
        .catch(() => {});
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [suggestKey]);

  function loadContext() {
    if (asked.current) return;
    asked.current = true;
    quickAddContext()
      .then((c) => c && setCtx(c))
      .catch(() => {
        asked.current = false;
      });
  }

  function submit() {
    if (!text.trim()) return;
    const picked = {
      ...(pickedAccount !== undefined ? { accountId: pickedAccount } : {}),
      ...(pickedCategory !== undefined ? { categoryId: pickedCategory || null } : {}),
    };
    start(async () => {
      const r = await quickAdd(text, Object.keys(picked).length ? picked : undefined);
      if (r.ok) {
        setDone(("summary" in r && r.summary) || "Listo");
        setError(null);
        setText("");
        setPickedAccount(undefined);
        setPickedCategory(undefined);
        input.current?.focus();
      } else setError(r.error);
    });
  }

  const showHelp = focused || text.trim() || done || error;

  return (
    <div className={cx("grid grid-cols-1 gap-1.5", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex h-12 items-center gap-2 rounded-full border border-line-strong bg-surface pr-1.5 pl-4 transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-3 focus-within:ring-[color-mix(in_oklab,var(--accent)_20%,transparent)]"
      >
        <Lightning size={17} weight="fill" className="shrink-0 text-accent-fg" aria-hidden />
        <input
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDone(null);
            setError(null);
            loadContext();
          }}
          onFocus={() => {
            setFocused(true);
            loadContext();
          }}
          onBlur={() => setFocused(false)}
          aria-label="Carga rápida"
          placeholder="Carga rápida: 350 almuerzo itau"
          enterKeyHint="send"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={!p || pending}
          className="h-9 shrink-0 rounded-full bg-ink px-4 text-[13px] font-medium text-on-ink transition-colors duration-150 disabled:bg-surface-2 disabled:text-muted"
        >
          {pending ? "…" : "Cargar"}
        </button>
      </form>
      {p && !done && !error ? (
        // Vista previa: lo que se va a cargar, con cuenta y categoría para cambiar.
        <div className="reveal flex flex-wrap items-center gap-1.5 px-2 text-[12.5px]" aria-live="polite">
          <span className={cx("px-1 font-medium tabular", p.kind === "income" && "fin-income")}>
            {p.kind === "income" ? "Ingreso" : "Gasto"} {moneyCents(p.amountCents, currency ?? "UYU")}
          </span>
          {p.title && <span className="min-w-0 truncate px-1 text-muted">{p.title}</span>}
          <PickChip label="Cuenta" text={acc ? acc.name : "Última cuenta usada"}>
            <select
              aria-label="Cuenta"
              value={accountId ?? ""}
              onChange={(e) => setPickedAccount(e.target.value || undefined)}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {!accountId && <option value="">Última cuenta usada</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </PickChip>
          <PickChip label="Categoría" text={category ? category.name : "Sin clasificar"} muted={!category}>
            <select
              aria-label="Categoría"
              value={categoryId ?? ""}
              onChange={(e) => setPickedCategory(e.target.value)}
              disabled={!ctx}
              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
            >
              <option value="">Sin clasificar</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </PickChip>
          {p.daysAgo > 0 && <span className="px-1 text-muted">{p.daysAgo === 1 ? "ayer" : "anteayer"}</span>}
        </div>
      ) : (
        /* La ayuda aparece solo mientras se usa (o con el resultado), así no ocupa lugar siempre. */
        <p className={cx("px-4 text-[12.5px] text-muted", showHelp ? "reveal" : "sr-only")} aria-live="polite">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : done ? (
            <span className="inline-flex items-center gap-1 text-[var(--st-done-fg)]">
              <CheckCircle size={14} weight="fill" className="mark-pop" aria-hidden /> {done}
            </span>
          ) : text.trim() ? (
            "Falta el monto"
          ) : (
            "Monto, qué fue y la cuenta. “+” adelante es ingreso; “ayer” cambia el día."
          )}
        </p>
      )}
    </div>
  );
}

/** Cuenta o categoría de la vista previa: se ve como etiqueta y se toca para elegir otra. */
function PickChip({ label, text, muted, children }: { label: string; text: string; muted?: boolean; children: React.ReactNode }) {
  return (
    <span
      title={`Cambiar ${label.toLowerCase()}`}
      className={cx(
        "relative inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-line-strong px-2.5 transition-colors focus-within:border-accent hover:bg-surface-2",
        muted ? "text-muted" : "text-fg",
      )}
    >
      <span className="truncate">{text}</span>
      <CaretDown size={11} weight="bold" className="shrink-0 opacity-60" aria-hidden />
      {children}
    </span>
  );
}
