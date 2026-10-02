/**
 * Entrar sin login, SOLO en la compu de desarrollo.
 *
 * Con `LOCAL_SIN_LOGIN="mail@..."` en el .env local, `npm run dev` entra sin
 * pedir contraseña. Nunca actúa en producción: exige NODE_ENV=development y que
 * no estemos en Vercel.
 */
export function mailSinLogin(): string | null {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) return null;
  const mail = process.env.LOCAL_SIN_LOGIN?.trim().toLowerCase();
  return mail || null;
}
