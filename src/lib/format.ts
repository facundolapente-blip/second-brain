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

/** Monto en centavos con signo explícito: "+ $ 2.615", "− US$ 40,50". Cero sin signo. */
export function moneySigned(cents: number, currency = "UYU"): string {
  if (cents === 0) return money(0, currency);
  return `${cents > 0 ? "+" : "−"} ${money(Math.abs(cents) / 100, currency)}`;
}

/** Monto en centavos, sin signo. */
export function moneyCents(cents: number, currency = "UYU"): string {
  return money(Math.abs(cents) / 100, currency);
}

/** Símbolo corto para prefijar un campo de monto. */
export function currencySymbol(currency: string): string {
  return currency === "UYU" ? "$" : currency === "USD" ? "US$" : currency;
}
