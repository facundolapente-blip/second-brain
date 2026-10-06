/**
 * Gastos "inteligentes", sin IA ni servicios externos (servidor y cliente):
 *  - clasificación: aprende de los títulos que ya clasificaste ("Mc" → Restaurante);
 *  - carga rápida: "350 almuerzo itau", "+2450 disco santander ayer", "usd 20 nafta".
 */

/** Título normalizado para comparar: sin tildes, minúsculas, sin números ni signos. */
export function normTitle(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-zñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type Classified = { title: string; categoryId: string; kind: string };

/**
 * Tabla título → categoría a partir del historial. Gana la categoría más usada
 * para ese título; también se indexa la primera palabra ("bajon kinko" → "bajon").
 */
export function buildClassifier(rows: Classified[]) {
  const full = new Map<string, Map<string, number>>();
  const first = new Map<string, Map<string, number>>();
  const bump = (m: Map<string, Map<string, number>>, k: string, cat: string) => {
    const inner = m.get(k) ?? new Map<string, number>();
    inner.set(cat, (inner.get(cat) ?? 0) + 1);
    m.set(k, inner);
  };
  for (const r of rows) {
    const n = normTitle(r.title);
    if (!n) continue;
    bump(full, `${r.kind}|${n}`, r.categoryId);
    const w = n.split(" ")[0];
    if (w.length >= 3) bump(first, `${r.kind}|${w}`, r.categoryId);
  }
  const best = (m?: Map<string, number>) => {
    if (!m) return null;
    let top: [string, number] | null = null;
    let total = 0;
    for (const e of m) {
      total += e[1];
      if (!top || e[1] > top[1]) top = e;
    }
    // Hace falta que la mayoría de las veces haya sido esa categoría.
    return top && top[1] / total >= 0.6 ? { categoryId: top[0], count: top[1] } : null;
  };
  return (title: string, kind: string): { categoryId: string; confidence: "alta" | "media" } | null => {
    const n = normTitle(title);
    if (!n) return null;
    const exact = best(full.get(`${kind}|${n}`));
    if (exact) return { categoryId: exact.categoryId, confidence: exact.count >= 2 ? "alta" : "media" };
    const w = n.split(" ")[0];
    const byWord = w.length >= 3 ? best(first.get(`${kind}|${w}`)) : null;
    return byWord && byWord.count >= 2 ? { categoryId: byWord.categoryId, confidence: "media" } : null;
  };
}

// ─── Carga rápida ───────────────────────────────────────────────────────────

export type QuickAccount = { id: string; name: string; currency: string };

export type QuickParse = {
  amountCents: number;
  kind: "expense" | "income";
  title: string;
  accountId: string | null;
  /** Moneda pedida en el texto ("usd 20"); la cuenta manda si no se dice. */
  currency: string | null;
  /** Días para atrás: 0 hoy, 1 ayer, 2 anteayer. */
  daysAgo: number;
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "1.250" → 125000, "45,50" → 4550, "12.5" → 1250. */
function amountOf(tok: string): number | null {
  let t = tok.replace(/^[+$]+/, "");
  if (!/^\d[\d.,]*$/.test(t)) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+\.\d{1,2}$/.test(t)) {
    /* decimal con punto */
  } else t = t.replace(/[.,]/g, "");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/**
 * Lee "350 almuerzo itau ayer" → gasto de $350, título "Almuerzo", cuenta Itau, ayer.
 * "+" adelante, o "cobré / me pagaron / ingreso", lo hace ingreso.
 */
export function parseQuick(text: string, accounts: QuickAccount[]): QuickParse | null {
  let rest = ` ${fold(text.trim())} `;
  const original = text.trim();
  if (!original) return null;
  let kind: "expense" | "income" = "expense";
  if (/^\s*\+/.test(original) || /\b(cobre|me pagaron|ingreso|me devolvieron|sueldo)\b/.test(rest)) kind = "income";

  let daysAgo = 0;
  if (/\banteayer\b/.test(rest)) daysAgo = 2;
  else if (/\bayer\b/.test(rest)) daysAgo = 1;
  rest = rest.replace(/\b(anteayer|ayer|hoy)\b/g, " ");

  // Cuenta: la que más letras del nombre coincide ("mercado pago", "itau").
  let accountId: string | null = null;
  const sorted = [...accounts].sort((a, b) => b.name.length - a.name.length);
  for (const a of sorted) {
    const n = fold(a.name);
    const words = [n, ...(n.includes(" ") ? [n.split(" ")[0]] : [])];
    const hit = words.find((w) => w.length >= 3 && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(rest));
    if (hit) {
      accountId = a.id;
      rest = rest.replace(new RegExp(`\\b${hit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`), " ");
      break;
    }
  }
  // La moneda se mira después de la cuenta: "dolares" puede ser el nombre de una.
  let currency: string | null = null;
  if (/(^|\s)(usd|us\$|u\$s|dolares|dls)(?=\s|$)/.test(rest)) currency = "USD";
  rest = rest.replace(/(^|\s)(usd|us\$|u\$s|dolares|dls)(?=\s|$)/g, " ");
  if (!currency && accountId) currency = accounts.find((a) => a.id === accountId)!.currency;

  let amountCents: number | null = null;
  const tokens = rest.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const t of tokens) {
    const a: number | null = amountCents === null ? amountOf(t) : null;
    if (a !== null) amountCents = a;
    else if (!/^\+$/.test(t)) kept.push(t);
  }
  if (amountCents === null) return null;
  // El título sale del texto original (con sus mayúsculas), sin lo que ya se usó.
  const used = new Set(tokens.filter((t) => !kept.includes(t)));
  const words = original
    .replace(/^\+/, "")
    .split(/\s+/)
    .filter((w) => kept.includes(fold(w)) && !used.has(fold(w)));
  const titleRaw = words
    .filter((w) => !["cobre", "ingreso"].includes(fold(w)))
    .join(" ")
    .replace(/me pagaron/i, "")
    .trim();
  const title = titleRaw ? titleRaw.charAt(0).toUpperCase() + titleRaw.slice(1) : "";
  return { amountCents, kind, title, accountId, currency, daysAgo };
}

// ─── Gastos fijos ───────────────────────────────────────────────────────────

export type FixedRow = { title: string; accountId: string; categoryId: string | null; cents: number; date: string };

export type FixedSuggestion = {
  key: string;
  title: string;
  accountId: string;
  categoryId: string | null;
  /** El monto de la última vez (las suscripciones suben de precio). */
  amountCents: number;
  /** Día del mes en que suele caer. */
  day: number;
  months: number;
  lastDate: string;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/**
 * Gastos que se repiten cada mes con monto parecido (alquiler, Spotify, gimnasio):
 * mismo título y cuenta en al menos 3 de los últimos 6 meses, uno solo por mes,
 * el 70% dentro de ±15% del monto típico y todavía vigente (en los últimos 2 meses).
 */
export function findFixedExpenses(rows: FixedRow[], today: string, skip: Set<string>): FixedSuggestion[] {
  const groups = new Map<string, FixedRow[]>();
  for (const r of rows) {
    const t = normTitle(r.title);
    if (t.length < 3) continue;
    const key = `${t}|${r.accountId}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const month = today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const recent = new Set([month, new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)]);
  const out: FixedSuggestion[] = [];
  for (const [key, list] of groups) {
    if (skip.has(key)) continue;
    const months = new Set(list.map((r) => r.date.slice(0, 7)));
    if (months.size < 3 || list.length > months.size * 1.5) continue;
    if (![...months].some((mm) => recent.has(mm))) continue;
    const typical = median(list.map((r) => r.cents));
    const close = list.filter((r) => Math.abs(r.cents - typical) <= typical * 0.15).length;
    if (close < list.length * 0.7) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted.at(-1)!;
    const cats = new Map<string | null, number>();
    for (const r of list) cats.set(r.categoryId, (cats.get(r.categoryId) ?? 0) + 1);
    out.push({
      key,
      title: last.title,
      accountId: last.accountId,
      categoryId: [...cats].sort((a, b) => b[1] - a[1])[0][0],
      amountCents: last.cents,
      day: median(list.map((r) => Number(r.date.slice(8)))),
      months: months.size,
      lastDate: last.date,
    });
  }
  return out.sort((a, b) => b.amountCents - a.amountCents);
}
