/**
 * Única forma de crear un PrismaClient, para la app y para los scripts de
 * `scripts/` (por eso sin `server-only` ni alias `@/`).
 *
 * El cliente se genera con `engineType = "client"`: sin el motor de Rust, las
 * consultas salen por node-postgres con `@prisma/adapter-pg`, y `new
 * PrismaClient()` sin adaptador falla. node-postgres usa consultas preparadas
 * sin nombre, así que el pooler de Neon ya no da "cached plan must not change
 * result type" después de una migración y no hace falta `pgbouncer=true`.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Limpia la URL para node-postgres: saca `pgbouncer` y `connection_limit` (solo
 * los entendía el motor viejo) y pide `sslmode=verify-full` en lugar de
 * `require` (si no, node-postgres avisa en cada conexión; Neon tiene
 * certificados válidos). Devuelve también el `connection_limit` que traía.
 */
export function limpiarUrl(url: string): { connectionString: string; max?: number } {
  const i = url.indexOf("?");
  if (i < 0) return { connectionString: url };
  let max: number | undefined;
  const params = url
    .slice(i + 1)
    .split("&")
    .filter((p) => {
      const [k, v] = p.split("=");
      if (k === "connection_limit") {
        const n = Number(v);
        if (Number.isInteger(n) && n > 0) max = n;
        return false;
      }
      return k !== "pgbouncer" && p !== "";
    })
    .map((p) => (p === "sslmode=require" ? "sslmode=verify-full" : p));
  return { connectionString: params.length ? `${url.slice(0, i)}?${params.join("&")}` : url.slice(0, i), max };
}

/**
 * Cliente nuevo contra `url` (por defecto `DATABASE_URL`). Si la URL trae
 * `connection_limit`, es el tamaño del pool: la base local (PGlite, `prisma
 * dev`) admite UNA sola sesión y su URL trae `connection_limit=1`; con más
 * conexiones falla ("prepared statement already exists") o se cuelga.
 */
export function nuevoPrisma(url = process.env.DATABASE_URL): PrismaClient {
  // Sin URL no falla al importar (el build puede cargar el módulo sin base): falla al consultar.
  const { connectionString, max } = limpiarUrl(url ?? "");
  const adapter = new PrismaPg({ connectionString: connectionString || undefined, ...(max ? { max } : {}) });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}
