import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "./auth";
import { mailSinLogin } from "./dev-login";

export type Usuario = { id: string; name: string; email: string };

/** Quién está usando la app, o null. Se resuelve una vez por request. */
export const getUsuario = cache(async (): Promise<Usuario | null> => {
  const mailLocal = mailSinLogin();
  if (mailLocal) return { id: "local", name: "Facu", email: mailLocal };

  const s = await auth.api.getSession({ headers: await headers() });
  if (!s?.user) return null;
  return { id: s.user.id, name: s.user.name, email: s.user.email };
});

/**
 * Portero de las server actions. Una server action es un endpoint público:
 * cualquiera puede mandarle un POST, así que cada una arranca llamando a esto.
 */
export async function exigirSesion(): Promise<Usuario> {
  const u = await getUsuario();
  if (!u) throw new Error("Sesión vencida. Entrá de nuevo para seguir.");
  return u;
}
