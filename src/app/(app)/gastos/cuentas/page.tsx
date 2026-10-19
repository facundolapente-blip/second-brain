import { getAccounts, getCardSummaries, getNetWorthSeries, getReserve } from "@/lib/finance";
import { todayISO } from "@/lib/dates";
import { getRates } from "@/lib/fx";
import { AccountsView } from "./accounts-view";

export const metadata = { title: "Cuentas · Gastos" };

export default async function CuentasPage({ searchParams }: PageProps<"/gastos/cuentas">) {
  const { nueva } = await searchParams;
  const [accounts, series, rates, reserve] = await Promise.all([getAccounts(), getNetWorthSeries(12), getRates(), getReserve()]);
  const cards = await getCardSummaries(accounts);
  return (
    <AccountsView
      accounts={accounts}
      cards={cards}
      today={todayISO()}
      openNew={nueva === "1"}
      netWorth={{ series: series.personal, business: series.business, usdRate: rates.toUyu.USD ?? null }}
      reserve={reserve}
    />
  );
}
