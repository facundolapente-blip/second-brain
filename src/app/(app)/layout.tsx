import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { THEME_COOKIE, themeFromCookie } from "@/lib/theme";
import { getUsuario } from "@/lib/session";
import { Shell } from "@/components/shell";
import { prisma } from "@/lib/prisma";
import { TOOL_ORDER_KEY } from "@/lib/tool-order";

export const dynamic = "force-dynamic";

/** Todo lo que está acá adentro exige sesión validada contra la base. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!(await getUsuario())) redirect("/login");
  // El orden propio de las Herramientas del menú (si no hay, el de siempre).
  const toolOrder = await prisma.appSetting.findUnique({ where: { key: TOOL_ORDER_KEY } }).catch(() => null);
  return (
    <Shell theme={themeFromCookie((await cookies()).get(THEME_COOKIE)?.value)} toolOrder={toolOrder?.value ?? null}>
      {children}
    </Shell>
  );
}
