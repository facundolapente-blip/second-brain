// "Revisar movimientos" de Gastos: busca lo que hoy cuenta mal en los números
// personales (cambios de dólares cargados como gasto + ingreso, discos y trabajo
// en cuentas personales, plata de mamá) y propone qué hacer con cada uno. Nada
// cambia hasta que Facu lo confirma en la pantalla. Lógica pura (servidor y cliente).
import { diffDays } from "./dates";

export type ReviewTx = {
  id: string;
  date: string;
  kind: "expense" | "income";
  cents: number;
  accountId: string;
  accountName: string;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryKind: "expense" | "income" | null;
  adjustment: boolean;
  title: string | null;
  note: string | null;
};

/**
 * Qué hacer con un movimiento: dejarlo, pasarlo al Negocio (de trabajo: no cuenta en lo
 * personal), a Aporte al negocio (plata tuya puesta en él: cuenta como gasto), a mamá u
 * otra categoría.
 */
export type ReviewChoice = "keep" | "trabajo" | "aporte" | "mama" | `cat:${string}`;
export type PairChoice = "transfer" | "keep";

export type ExchangePair = {
  key: string;
  /** El gasto (sale de una moneda) y el ingreso (entra en la otra). */
  out: ReviewTx;
  in: ReviewTx;
  /** Pesos por dólar que da el par. */
  rate: number;
};

export type ReviewItem = { tx: ReviewTx; proposal: ReviewChoice; reason: string };

export type ReviewData = {
  pairs: ExchangePair[];
  /** Parecen cambios de moneda pero no tienen pareja clara: se revisan a mano. */
  loose: ReviewTx[];
  trabajo: ReviewItem[];
  mama: ReviewItem[];
};

/** Nombres de las categorías que usa la revisión (se crean si faltan). */
export const REVIEW_CATEGORIES = {
  mamaExpense: "Gastos mamá",
  mamaIncome: "Ingresos mamá",
  aporte: "Aporte al negocio",
  /** De trabajo (no cuenta en lo personal). "Trabajo" sigue siendo personal: ahí están los sueldos. */
  negocio: "Negocio",
} as const;

/** Ids ya revisados (cambiados o dejados como estaban): no vuelven a aparecer. */
export const REVIEWED_KEY = "gastos_revisados";
/** Lo necesario para deshacer la última revisión aplicada. */
export const REVIEW_UNDO_KEY = "gastos_revision_deshacer";

const fold = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const text = (t: ReviewTx) => fold(`${t.title ?? ""} ${t.note ?? ""}`);

/** "A pesos", "de dólares", "en pesos", "cambio": suena a cambio de moneda. */
export function looksLikeExchange(t: Pick<ReviewTx, "title" | "note">): boolean {
  const s = fold(`${t.title ?? ""} ${t.note ?? ""}`);
  return /\b(a|de|en|x|por)\s+(pesos|dolares|dolar|usd|uyu|u\$s)\b/.test(s) || /\bcambi(o|e|ar)\b/.test(s);
}

/**
 * Discos y vinilos. "Disco" a secas es el súper: solo cuenta en plural, con "venta",
 * "x", "seña"… adelante, o si ya está en Trabajo.
 */
export function looksLikeRecords(t: Pick<ReviewTx, "title" | "note" | "categoryName">): boolean {
  const s = fold(`${t.title ?? ""} ${t.note ?? ""}`);
  if (/\b(discos|vinilos?)\b/.test(s)) return true;
  if (/\b(venta|vendi|x|por|sena|reserva)\s+(de\s+)?disco\b/.test(s)) return true;
  return /\bdisco\b/.test(s) && fold(t.categoryName) === "trabajo";
}

/** Los emprendimientos de Facu (Arcano, HouseMates) y lo que solo usa el negocio. */
export function looksLikeVenture(t: Pick<ReviewTx, "title" | "note">): boolean {
  return /\b(arcano|house ?mates|deejay|djdeliv\w*|anuncios)\b/.test(fold(`${t.title ?? ""} ${t.note ?? ""}`));
}

/** Plata de mamá: lo nombra. */
export function mentionsMom(t: Pick<ReviewTx, "title" | "note">): boolean {
  return /\b(mama|mami|madre)\b/.test(fold(`${t.title ?? ""} ${t.note ?? ""}`));
}

const isWorkCategory = (t: Pick<ReviewTx, "categoryName">) => fold(t.categoryName) === "trabajo";
/** Regalos y cumpleaños de mamá: plata de verdad, no un favor (se proponen dejar como están). */
const isGift = (t: ReviewTx) => /\b(regalo|cumple\w*)\b/.test(text(t));

/** Pesos por dólar de un par (null si no son pesos y dólares). */
function pairRate(out: ReviewTx, inc: ReviewTx): number | null {
  const pesos = out.currency === "UYU" ? out : inc.currency === "UYU" ? inc : null;
  const dollars = out.currency === "USD" ? out : inc.currency === "USD" ? inc : null;
  if (!pesos || !dollars || pesos === dollars || dollars.cents <= 0) return null;
  return pesos.cents / dollars.cents;
}

/** Cotización que se considera posible para un cambio (la de 2026 anda en 39–41). */
export const RATE_RANGE = [30, 50] as const;

/**
 * Pares gasto en una moneda + ingreso en la otra que parecen el mismo cambio: hasta 3
 * días de diferencia, cotización posible y al menos uno de los dos que lo diga en el
 * título ("A pesos", "De dólares"). Se eligen los más parecidos primero (cada
 * movimiento va en un solo par). El ingreso puede ser un ajuste de saldo (a veces el
 * cambio se cuadró así).
 */
export function findExchangePairs(txs: ReviewTx[]): { pairs: ExchangePair[]; loose: ReviewTx[] } {
  const outs = txs.filter((t) => t.kind === "expense" && !t.adjustment);
  const ins = txs.filter((t) => t.kind === "income");
  const candidates: { out: ReviewTx; in: ReviewTx; rate: number; score: number }[] = [];
  for (const o of outs) {
    for (const i of ins) {
      if (o.currency === i.currency || o.accountId === i.accountId) continue;
      const days = Math.abs(diffDays(o.date, i.date));
      if (days > 3) continue;
      if (!looksLikeExchange(o) && !looksLikeExchange(i)) continue;
      const rate = pairRate(o, i);
      if (rate === null || rate < RATE_RANGE[0] || rate > RATE_RANGE[1]) continue;
      // Con un ajuste de saldo del otro lado, solo el mismo día o el siguiente y una cotización normal.
      if (i.adjustment && (days > 1 || rate < 35 || rate > 46)) continue;
      const signals = Number(looksLikeExchange(o)) + Number(looksLikeExchange(i));
      // Si solo una de las dos filas dice que es un cambio, tienen que ser del mismo día o del siguiente.
      if (signals === 1 && days > 1) continue;
      candidates.push({ out: o, in: i, rate, score: days + Math.abs(rate - 40) / 4 - signals * 0.5 + (i.adjustment ? 0.5 : 0) });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  const used = new Set<string>();
  const pairs: ExchangePair[] = [];
  for (const c of candidates) {
    if (used.has(c.out.id) || used.has(c.in.id)) continue;
    used.add(c.out.id);
    used.add(c.in.id);
    pairs.push({ key: `${c.out.id}+${c.in.id}`, out: c.out, in: c.in, rate: Math.round(c.rate * 100) / 100 });
  }
  pairs.sort((a, b) => b.out.date.localeCompare(a.out.date));
  const loose = txs.filter((t) => !used.has(t.id) && !t.adjustment && looksLikeExchange(t));
  return { pairs, loose };
}

/**
 * Todo lo que conviene revisar. `txs`: gastos e ingresos de las cuentas personales que
 * todavía no se revisaron, sin los que ya están en categorías de trabajo o de plata de
 * otra persona.
 */
export function buildReview(txs: ReviewTx[]): ReviewData {
  const { pairs, loose } = findExchangePairs(txs);
  const inPair = new Set(pairs.flatMap((p) => [p.out.id, p.in.id]));
  const looseIds = new Set(loose.map((t) => t.id));
  const rest = txs.filter((t) => !inPair.has(t.id) && !looseIds.has(t.id) && !t.adjustment);

  const trabajo: ReviewItem[] = [];
  const mama: ReviewItem[] = [];
  for (const t of rest) {
    if (mentionsMom(t)) {
      // "Disco mama" es el súper que pagó mamá, no un disco: mamá va primero.
      mama.push(isGift(t) ? { tx: t, proposal: "keep", reason: "Parece un regalo" } : { tx: t, proposal: "mama", reason: "Nombra a mamá" });
    } else if (looksLikeVenture(t)) {
      trabajo.push({ tx: t, proposal: "trabajo", reason: "Arcano / HouseMates" });
    } else if (looksLikeRecords(t)) {
      // Una venta de discos que entró en una cuenta personal es del negocio, igual que una
      // compra cargada en Trabajo. Las compras en otras categorías (Entretenimiento) eran
      // tuyas: se muestran para decidir, sin proponer.
      const sale = t.kind === "income";
      trabajo.push(
        sale || isWorkCategory(t)
          ? { tx: t, proposal: "trabajo", reason: sale ? "Venta de discos" : "Compra de discos en Trabajo" }
          : { tx: t, proposal: "keep", reason: "Compra de discos" },
      );
    } else if (isWorkCategory(t)) {
      // En Trabajo también están los sueldos: se muestran, pero no se propone nada.
      trabajo.push({ tx: t, proposal: "keep", reason: "Está en Trabajo" });
    } else if (t.kind === "income" && fold(t.categoryName) === "casa" && /nafta|comida|psiqui|ficha|smi|irpf/.test(text(t))) {
      // Suelen ser reintegros de la casa, pero no lo dicen: se muestran sin proponer nada.
      mama.push({ tx: t, proposal: "keep", reason: "Ingreso de Casa que parece un reintegro" });
    }
  }
  const newest = (a: ReviewItem, b: ReviewItem) => b.tx.date.localeCompare(a.tx.date);
  return { pairs, loose, trabajo: trabajo.sort(newest), mama: mama.sort(newest) };
}

/** Qué opciones tiene un movimiento en cada grupo. */
export function choicesFor(group: "trabajo" | "mama", t: Pick<ReviewTx, "kind">): ReviewChoice[] {
  if (group === "mama") return ["mama", "keep"];
  return t.kind === "expense" ? ["trabajo", "aporte", "keep"] : ["trabajo", "keep"];
}

/** Lo que se aplica: un resumen para el botón ("4 a transferencias, 7 a trabajo…"). */
export function summarizeChoices(
  pairs: Record<string, PairChoice>,
  items: Record<string, ReviewChoice>,
): { transfers: number; trabajo: number; aporte: number; mama: number; other: number; total: number } {
  const transfers = Object.values(pairs).filter((c) => c === "transfer").length;
  const vals = Object.values(items);
  const trabajo = vals.filter((c) => c === "trabajo").length;
  const aporte = vals.filter((c) => c === "aporte").length;
  const mama = vals.filter((c) => c === "mama").length;
  const other = vals.filter((c) => c.startsWith("cat:")).length;
  return { transfers, trabajo, aporte, mama, other, total: transfers + trabajo + aporte + mama + other };
}

/** Lee la lista de ids revisados guardada (JSON); cualquier cosa rara = vacía. */
export function parseReviewed(raw: string | null | undefined): Set<string> {
  try {
    const v = JSON.parse(raw ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
