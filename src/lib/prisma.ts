import type { PrismaClient } from "@prisma/client";
import { nuevoPrisma } from "./prisma-conexion";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * El cliente de la app. Va por node-postgres con el adaptador de Prisma (sin el
 * motor de Rust, para que cada función de Vercel pese menos); la conexión y la
 * limpieza de la URL están en `prisma-conexion.ts`, compartidas con los scripts.
 */
export const prisma = globalForPrisma.prisma ?? nuevoPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
