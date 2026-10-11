import "server-only";
import { cache } from "react";
import { prisma } from "./prisma";

/**
 * Cotizaciones para pasar todo a pesos uruguayos. Se piden a open.er-api.com
 * (gratis, sin clave) como mucho cada 6 horas; si no responde se usa la última
 * guardada (AppSetting "fx") y, si nunca hubo, un valor de respaldo.
 */
export type Rates = {
  /** Pesos uruguayos por unidad de cada moneda (UYU = 1). */
  toUyu: Record<string, number>;
  /** Día de la cotización (YYYY-MM-DD). */
  date: string;
  /** "live" recién pedida, "saved" la última guardada, "fallback" de respaldo. */
  source: "live" | "saved" | "fallback";
};

const FALLBACK: Rates = { toUyu: { UYU: 1, USD: 40, EUR: 43.5, ARS: 0.04, BRL: 7.3 }, date: "2026-10-01", source: "fallback" };

const FRESH_MS = 6 * 3600 * 1000;

/**
 * La cotización guardada si tiene menos de 6 horas; si no, se pide afuera. (El
 * `revalidate` de fetch no sirve acá: las páginas son dinámicas y Next no guarda
 * nada, así que antes se pedía en cada carga.) Una vez por pedido (`cache`).
 */
export const getRates = cache(async (): Promise<Rates> => {
  const saved = await prisma.appSetting.findUnique({ where: { key: "fx" } }).catch(() => null);
  if (saved && Date.now() - saved.updatedAt.getTime() < FRESH_MS) {
    try {
      return { ...(JSON.parse(saved.value) as Rates), source: "saved" };
    } catch {
      // guardada rota: se pide de nuevo
    }
  }
  return fetchRates(saved?.value ?? null);
});

async function fetchRates(savedValue: string | null): Promise<Rates> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const j = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_unix?: number };
      const uyu = j.rates?.UYU;
      if (j.result === "success" && uyu && j.rates) {
        const toUyu: Record<string, number> = { UYU: 1 };
        for (const c of ["USD", "EUR", "ARS", "BRL"]) if (j.rates[c]) toUyu[c] = uyu / j.rates[c];
        const rates: Rates = {
          toUyu,
          date: new Date((j.time_last_update_unix ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10),
          source: "live",
        };
        await prisma.appSetting
          .upsert({ where: { key: "fx" }, create: { key: "fx", value: JSON.stringify(rates) }, update: { value: JSON.stringify(rates) } })
          .catch(() => {});
        return rates;
      }
    }
  } catch {
    // sin red o la API no respondió: se usa la guardada
  }
  if (savedValue) {
    try {
      return { ...(JSON.parse(savedValue) as Rates), source: "saved" };
    } catch {
      // sigue al respaldo
    }
  }
  return FALLBACK;
}

/**
 * Centavos de cualquier moneda a centavos de pesos (moneda desconocida = 0).
 * Lo convertido se redondea a pesos enteros: los centavos de una cotización son ruido.
 */
export function toUyu(cents: number, currency: string, rates: Rates): number {
  if (currency === "UYU") return cents;
  const r = rates.toUyu[currency];
  return r ? Math.round((cents * r) / 100) * 100 : 0;
}
