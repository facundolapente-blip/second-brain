"use client";

import { useSafeTransition } from "@/components/safe-action";
import { useRef, useState } from "react";
import { CheckCircle, Lightning } from "@phosphor-icons/react";
import { quickAdd } from "@/lib/offline/finance";
import { parseQuick, type QuickAccount } from "@/lib/smart-logic";
import { moneyCents } from "@/lib/format";
import { cx } from "@/components/ui";

/**
 * Carga rápida escribiendo: "350 almuerzo itau", "+2450 disco santander ayer",
 * "usd 20 nafta". Mientras escribís muestra qué va a cargar; Enter lo guarda y
 * la categoría la pone sola si ya clasificaste algo parecido.
 */
export function QuickAdd({ accounts, className }: { accounts: QuickAccount[]; className?: string }) {
  const [text, setText] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [pending, start] = useSafeTransition();
  const input = useRef<HTMLInputElement>(null);
  const p = text.trim() ? parseQuick(text, accounts) : null;
  const acc = p?.accountId ? accounts.find((a) => a.id === p.accountId) : null;

  function submit() {
    if (!text.trim()) return;
    start(async () => {
      const r = await quickAdd(text);
      if (r.ok) {
        setDone(r.summary ?? "Listo");
        setError(null);
        setText("");
        input.current?.focus();
      } else setError(r.error);
    });
  }

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
          }}
          onFocus={() => setFocused(true)}
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
      {/* La ayuda aparece solo mientras se usa (o con el resultado), así no ocupa lugar siempre. */}
      <p className={cx("px-4 text-[12.5px] text-muted", focused || text.trim() || done || error ? "reveal" : "sr-only")} aria-live="polite">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : done ? (
          <span className="inline-flex items-center gap-1 text-[var(--st-done-fg)]">
            <CheckCircle size={14} weight="fill" aria-hidden /> {done}
          </span>
        ) : p ? (
          <>
            {p.kind === "income" ? "Ingreso" : "Gasto"} de {moneyCents(p.amountCents, p.currency ?? acc?.currency ?? "UYU")}
            {p.title && ` · ${p.title}`} · {acc ? acc.name : "última cuenta usada"}
            {p.daysAgo ? (p.daysAgo === 1 ? " · ayer" : " · anteayer") : ""}
          </>
        ) : text.trim() ? (
          "Falta el monto"
        ) : (
          "Monto, qué fue y la cuenta. “+” adelante es ingreso; “ayer” cambia el día."
        )}
      </p>
    </div>
  );
}
