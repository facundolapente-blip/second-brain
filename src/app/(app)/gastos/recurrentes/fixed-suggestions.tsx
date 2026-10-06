"use client";

import { useState, useTransition } from "react";
import { Sparkle } from "@phosphor-icons/react";
import type { FixedSuggestion } from "@/lib/smart-logic";
import type { AccountDTO, CategoryDTO } from "@/lib/finance-logic";
import { acceptFixed, ignoreFixed } from "@/lib/finance-actions";
import { formatShort } from "@/lib/dates";
import { moneyCents } from "@/lib/format";
import { CategoryAvatar, useLookups } from "../shared";

/** Gastos que se repiten todos los meses y todavía no son recurrentes. */
export function FixedSuggestions({
  suggestions,
  accounts,
  categories,
}: {
  suggestions: FixedSuggestion[];
  accounts: AccountDTO[];
  categories: CategoryDTO[];
}) {
  const lk = useLookups(accounts, categories);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const shown = suggestions.filter((s) => !hidden.has(s.key));
  if (!shown.length) return null;

  const hide = (key: string) => setHidden((h) => new Set(h).add(key));

  return (
    <section className="grid gap-3 rounded-[20px] border border-line bg-surface p-4 lg:p-5">
      <header className="grid gap-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Sparkle size={17} weight="fill" className="text-[var(--c-gastos)]" aria-hidden />
          Parecen gastos fijos
        </h2>
        <p className="text-[13px] text-muted">
          Se repiten todos los meses con un monto parecido. Pasalos a recurrentes y se cargan solos el día que tocan.
        </p>
      </header>
      <ul className="grid divide-y divide-line">
        {shown.map((s) => {
          const account = lk.account(s.accountId);
          return (
            <li key={s.key} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:flex sm:items-center sm:gap-3">
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <CategoryAvatar category={lk.category(s.categoryId)} />
                <span className="grid min-w-0">
                  <span className="truncate text-[14.5px] font-medium">{s.title}</span>
                  <span className="truncate text-[12.5px] text-muted">
                    {moneyCents(s.amountCents, account?.currency ?? "UYU")} · cerca del día {s.day} · {s.months} meses
                    {account ? ` · ${account.name}` : ""} · último {formatShort(s.lastDate)}
                  </span>
                </span>
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    hide(s.key);
                    start(() => ignoreFixed(s.key));
                  }}
                  className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  No es fijo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    hide(s.key);
                    start(async () => {
                      const r = await acceptFixed(s);
                      if (!r.ok) setError(r.error);
                    });
                  }}
                  className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-on-ink transition-[opacity,transform] hover:opacity-90 active:scale-[0.98]"
                >
                  Pasar a recurrente
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
