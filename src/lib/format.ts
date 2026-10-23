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
  // Espacio duro: el símbolo nunca queda en un renglón y el número en el otro.
  return `${value < 0 ? "-" : ""}${SYMBOL[currency] ?? currency}\u00a0${n}`;
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
  return `${cents > 0 ? "+" : "−"}\u00a0${money(Math.abs(cents) / 100, currency)}`;
}

/** Monto en centavos, sin signo. */
export function moneyCents(cents: number, currency = "UYU"): string {
  return money(Math.abs(cents) / 100, currency);
}

/** Monto redondeado a pesos (para totales y promedios; en otras monedas quedan los centavos). */
export function moneyWhole(cents: number, currency = "UYU"): string {
  return moneyCents(currency === "UYU" ? Math.round(cents / 100) * 100 : cents, currency);
}

/** Un decimal, con coma: 3.6 → "3,6"; los negativos con "−". */
export function dec1(n: number): string {
  const v = Math.round(n * 10) / 10;
  const s = Math.abs(v).toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return v < 0 ? `−${s}` : s;
}

/** Número corto para gráficos: 850 → "850", 8.800 → "8,8k", 24.700 → "24,7k", 1.250.000 → "1,3M". */
export function shortNumber(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  const f = (n: number) => n.toLocaleString("es-UY", { maximumFractionDigits: 1 });
  if (a < 1000) return sign + Math.round(a).toLocaleString("es-UY");
  if (a < 1_000_000) return `${sign}${f(a / 1000)}k`;
  return `${sign}${f(a / 1_000_000)}M`;
}

/** Símbolo corto para prefijar un campo de monto. */
export function currencySymbol(currency: string): string {
  return currency === "UYU" ? "$" : currency === "USD" ? "US$" : currency;
}
