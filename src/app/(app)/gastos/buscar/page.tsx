import { getAccounts, getCategories, getHistory, getTemplates } from "@/lib/finance";
import { isISODate } from "@/lib/dates";
import { parseAmount } from "@/lib/finance-logic";
import { HistoryView } from "./history-view";

export const metadata = { title: "Buscar · Gastos" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

export default async function HistorialPage({ searchParams }: PageProps<"/gastos/buscar">) {
  const sp = await searchParams;
  const kind = str(sp.tipo);
  const filters = {
    q: str(sp.q).slice(0, 80) || undefined,
    accountId: str(sp.cuenta) || undefined,
    categoryId: str(sp.cat) || undefined,
    kind: kind === "expense" || kind === "income" || kind === "transfer" ? kind : undefined,
    from: isISODate(str(sp.desde)) ? str(sp.desde) : undefined,
    to: isISODate(str(sp.hasta)) ? str(sp.hasta) : undefined,
    min: parseAmount(str(sp.min)) ?? undefined,
    max: parseAmount(str(sp.max)) ?? undefined,
    limit: Math.min(2000, Math.max(100, Number(str(sp.n)) || 150)),
  } as const;
  const [accounts, categories, templates, history] = await Promise.all([
    getAccounts(),
    getCategories(),
    getTemplates(),
    getHistory(filters),
  ]);
  return (
    <HistoryView
      accounts={accounts}
      categories={categories}
      templates={templates}
      {...history}
      params={{
        q: str(sp.q),
        cuenta: str(sp.cuenta),
        cat: str(sp.cat),
        tipo: kind,
        desde: str(sp.desde),
        hasta: str(sp.hasta),
        min: str(sp.min),
        max: str(sp.max),
      }}
      limit={filters.limit}
    />
  );
}
