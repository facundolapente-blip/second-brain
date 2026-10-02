const cache = new Map<string, Intl.NumberFormat>();

function nf(currency: string, decimals: boolean): Intl.NumberFormat {
  const key = `${currency}:${decimals}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("es-UY", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    });
    cache.set(key, f);
  }
  return f;
}

/** "$ 1.250" o "US$ 40,50": decimales solo si los tiene. */
export function money(value: number, currency = "UYU"): string {
  return nf(currency, Math.round(value * 100) % 100 !== 0).format(value);
}

export const CURRENCIES = ["UYU", "USD", "ARS", "EUR", "BRL"] as const;

export const ACCOUNT_TYPES: Record<string, string> = {
  cash: "Efectivo",
  bank: "Banco",
  card: "Tarjeta",
  savings: "Ahorro",
  investment: "Inversión",
};
