import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { THEME_COOKIE, isTheme } from "@/lib/theme";
import { getUsuario } from "@/lib/session";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

/** Todo lo que está acá adentro exige sesión validada contra la base. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!(await getUsuario())) redirect("/login");
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  return <Shell theme={isTheme(saved) ? saved : "auto"}>{children}</Shell>;
}
