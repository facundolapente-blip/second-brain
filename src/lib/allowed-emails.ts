/**
 * Los únicos mails que pueden tener cuenta (ALLOWED_EMAILS, separados por coma).
 * Vacío significa que nadie puede registrarse: mejor quedarse afuera que dejar
 * la puerta abierta por un descuido de configuración.
 */
export function mailPermitido(email: string | null | undefined): boolean {
  const lista = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
  if (lista.length === 0) return false;
  return lista.includes((email ?? "").trim().toLowerCase());
}
