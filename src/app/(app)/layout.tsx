import { redirect } from "next/navigation";
import { getUsuario } from "@/lib/session";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

/** Todo lo que está acá adentro exige sesión validada contra la base. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!(await getUsuario())) redirect("/login");
  return <Shell>{children}</Shell>;
}
