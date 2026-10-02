import { getAccounts } from "@/lib/finance";
import { AccountsView } from "./accounts-view";

export const metadata = { title: "Cuentas · Gastos" };

export default async function CuentasPage({ searchParams }: PageProps<"/gastos/cuentas">) {
  const { nueva } = await searchParams;
  const accounts = await getAccounts();
  return <AccountsView accounts={accounts} openNew={nueva === "1"} />;
}
