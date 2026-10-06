import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { THEME_COOKIE, themeFromCookie } from "@/lib/theme";
import { getUsuario } from "@/lib/session";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

/** Todo lo que está acá adentro exige sesión validada contra la base. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!(await getUsuario())) redirect("/login");
  return <Shell theme={themeFromCookie((await cookies()).get(THEME_COOKIE)?.value)}>{children}</Shell>;
}
