import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * En producción la conexión va por el pooler de Neon (PgBouncer), que guarda las
 * consultas preparadas por su texto: después de una migración que cambia el tipo
 * de una columna, esas consultas fallan ("cached plan must not change result
 * type") hasta que se renuevan las conexiones. Con `pgbouncer=true` Prisma no
 * reutiliza consultas preparadas y eso no pasa.
 */
function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || /[?&]pgbouncer=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}pgbouncer=true`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
