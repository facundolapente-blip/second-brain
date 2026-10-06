import { getAccounts, getNetWorthSeries } from "@/lib/finance";
import { getRates } from "@/lib/fx";
import { AccountsView } from "./accounts-view";

export const metadata = { title: "Cuentas · Gastos" };

export default async function CuentasPage({ searchParams }: PageProps<"/gastos/cuentas">) {
  const { nueva } = await searchParams;
  const [accounts, series, rates] = await Promise.all([getAccounts(), getNetWorthSeries(12), getRates()]);
  return <AccountsView accounts={accounts} openNew={nueva === "1"} netWorth={{ series, usdRate: rates.toUyu.USD ?? null }} />;
}
