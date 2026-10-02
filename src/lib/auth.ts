import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./prisma";
import { mailPermitido } from "./allowed-emails";

/**
 * La URL con la que se firman las cookies. Cada preview de Vercel tiene su propio
 * dominio: con la URL de producción el navegador no aceptaría la cookie.
 */
export function urlBase(): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: urlBase(),
  trustedOrigins: [urlBase()],

  emailAndPassword: {
    enabled: true,
    // Es una sola persona y no hay servidor de mails: la contraseña se elige
    // la primera vez y se entra directo.
    autoSignIn: true,
    minPasswordLength: 8,
    requireEmailVerification: false,
  },

  session: {
    modelName: "AuthSession",
    // App personal que se usa todos los días desde el celular: sesión larga
    // que se renueva sola mientras se usa.
    expiresIn: 60 * 60 * 24 * 90,
    updateAge: 60 * 60 * 24,
  },
  user: { modelName: "AuthUser" },
  account: { modelName: "AuthAccount" },
  verification: { modelName: "AuthVerification" },

  databaseHooks: {
    user: {
      create: {
        // La lista blanca se controla del lado del servidor: un mail de afuera
        // no crea usuario, mande lo que mande el formulario.
        before: async (user) => {
          if (!mailPermitido(user.email)) {
            throw new APIError("FORBIDDEN", { message: "Ese mail no tiene acceso." });
          }
          return { data: user };
        },
      },
    },
  },

  advanced: { cookiePrefix: "sb" },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60 * 60, max: 5 },
    },
  },

  plugins: [nextCookies()],
});
