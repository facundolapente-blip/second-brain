const whole = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 });
const cents2 = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SYMBOL: Record<string, string> = { UYU: "$", USD: "US$", ARS: "AR$", EUR: "€", BRL: "R$" };

/**
 * "$ 1.250" o "US$ 40,50": decimales solo si los tiene. El símbolo va a mano
 * porque el estilo "currency" de Intl cambia según el navegador (en algunos
 * celulares sale "UYU 1.250").
 */
export function money(value: number, currency = "UYU"): string {
  const decimals = Math.round(value * 100) % 100 !== 0;
  const n = (decimals ? cents2 : whole).format(Math.abs(value));
  return `${value < 0 ? "-" : ""}${SYMBOL[currency] ?? currency} ${n}`;
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
