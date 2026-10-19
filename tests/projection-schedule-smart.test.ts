import { describe, expect, it } from "vitest";
import { apportion, buildProjection, type FlowDay } from "@/lib/projection";
import { frequencyLabel, nextOnOrAfter, occurrence, occurrencesBetween } from "@/lib/schedule-logic";
import { buildClassifier, findFixedExpenses, normTitle, parseQuick, type FixedRow } from "@/lib/smart-logic";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("apportion (redondeo por mayor resto)", () => {
  it("la suma da el total justo y cada parte queda a menos de $ 1", () => {
    const exact = [3333, 3333, 3334];
    const out = apportion(exact, 10000);
    expect(out).toEqual([3300, 3300, 3400]);
    expect(sum(out)).toBe(10000);
  });

  it("casos varios", () => {
    const cases: [number[], number][] = [
      [[150, 250], 400],
      [[12345.6, 67890.1, 111.11, 9999.99], 90300],
      [[1, 1, 1, 1, 1, 1, 1], 0],
      [[49.5, 50.5], 100],
    ];
    for (const [exact, total] of cases) {
      const out = apportion(exact, total);
      expect(sum(out)).toBe(total);
      out.forEach((v, i) => {
        expect(v % 100).toBe(0);
        expect(Math.abs(v - exact[i])).toBeLessThan(100);
      });
    }
    expect(apportion([], 0)).toEqual([]);
  });
});

describe("buildProjection", () => {
  it("cierre = gastado + ritmo × días que faltan", () => {
    // Sin historial: el ritmo es el del mes (pesado por la parte que pasó).
    const rows: FlowDay[] = [{ date: "2026-10-05", kind: "expense", categoryId: "a", cents: 31000 }];
    const p = buildProjection(rows, "2026-10", "2026-10-10", { expense: 0, income: 0 });
    // w = 10/31; ritmo = w × 3100 = 1000 por día; faltan 21 días.
    expect(p.spent).toBe(31000);
    expect(p.projected).toBe(52000);
    expect(p.days).toBe(31);
    expect(p.elapsed).toBe(10);
  });

  it("las categorías suman justo la proyección del mes", () => {
    const rows: FlowDay[] = [];
    const cats = ["super", "salidas", "nafta", null, "casa"];
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (const m of ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]) {
      for (let d = 1; d <= (m === "2026-10" ? 17 : 28); d += 2) {
        const cat = cats[Math.floor(rnd() * cats.length)];
        rows.push({ date: `${m}-${String(d).padStart(2, "0")}`, kind: "expense", categoryId: cat, cents: Math.round(rnd() * 500000) + 37 });
      }
      rows.push({ date: `${m}-01`, kind: "income", categoryId: "sueldo", cents: 8_000_000 });
    }
    const p = buildProjection(rows, "2026-10", "2026-10-17", { expense: 0, income: 0 });
    expect(sum(p.categories.map((c) => c.projected))).toBe(p.projected);
    expect(p.projected % 100).toBe(0);
    // De mayor a menor.
    for (let i = 1; i < p.categories.length; i++) expect(p.categories[i - 1].projected).toBeGreaterThanOrEqual(p.categories[i].projected);
  });

  it("próximos meses: promedio de 3 meses + tendencia, a i + 2 pasos", () => {
    // Gasto que sube $ 10 por mes: abril 1000 ... septiembre 1050.
    const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
    const rows: FlowDay[] = months.map((m, i) => ({ date: `${m}-15`, kind: "expense", categoryId: "a", cents: 100000 + i * 1000 }));
    const p = buildProjection(rows, "2026-10", "2026-10-01", { expense: 0, income: 0 });
    expect(p.avgMonth).toBe(104000);
    // La recta sigue: octubre 1060, noviembre 1070, diciembre 1080, enero 1090.
    expect(p.next.map((n) => n.month)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(p.next.map((n) => n.expense)).toEqual([107000, 108000, 109000]);
    expect(p.trendPct).toBeCloseTo(3000 / 104000);
  });

  it("la tendencia corrige como mucho un 25%", () => {
    const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
    const rows: FlowDay[] = months.map((m, i) => ({ date: `${m}-15`, kind: "expense", categoryId: "a", cents: 100000 * (i + 1) }));
    const p = buildProjection(rows, "2026-10", "2026-10-01", { expense: 0, income: 0 });
    expect(p.avgMonth).toBe(500000);
    expect(p.next.every((n) => n.expense === 625000)).toBe(true);
  });
});

describe("recurrentes (schedule-logic)", () => {
  it("un 31 cae el 30 en abril y vuelve al 31 en mayo", () => {
    expect([0, 1, 2, 3, 4].map((n) => occurrence("2026-01-31", "monthly", 1, n))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  it("anual del 29 de febrero: 28 en años comunes, 29 en bisiestos", () => {
    expect(occurrence("2028-02-29", "yearly", 1, 1)).toBe("2029-02-28");
    expect(occurrence("2028-02-29", "yearly", 1, 4)).toBe("2032-02-29");
  });

  it("intervalos, semanal, diario y una vez", () => {
    expect(occurrence("2026-10-19", "weekly", 2, 1)).toBe("2026-11-02");
    expect(occurrence("2026-10-19", "daily", 3, 2)).toBe("2026-10-25");
    expect(occurrence("2026-10-31", "monthly", 2, 2)).toBe("2027-02-28");
    expect(occurrence("2026-10-19", "once", 1, 0)).toBe("2026-10-19");
    expect(occurrence("2026-10-19", "once", 1, 1)).toBeNull();
    expect(occurrence("2026-10-19", "daily", 0, 1)).toBe("2026-10-20"); // intervalo mínimo 1
  });

  it("próxima vez y veces entre dos días, respetando el fin", () => {
    const s = { startDate: "2026-01-31", frequency: "monthly" as const, interval: 1, endDate: null };
    expect(nextOnOrAfter(s, "2026-04-01")).toBe("2026-04-30");
    expect(nextOnOrAfter(s, "2026-01-01")).toBe("2026-01-31");
    expect(occurrencesBetween(s, "2026-03-01", "2026-06-30")).toEqual(["2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"]);
    expect(nextOnOrAfter({ ...s, endDate: "2026-03-15" }, "2026-04-01")).toBeNull();
    expect(nextOnOrAfter({ ...s, frequency: "once" }, "2026-02-01")).toBeNull();
  });

  it("rótulos", () => {
    expect(frequencyLabel("monthly", 1)).toBe("Todos los meses");
    expect(frequencyLabel("weekly", 2)).toBe("Cada 2 semanas");
    expect(frequencyLabel("once", 5)).toBe("Una vez");
  });
});

describe("clasificación automática (buildClassifier)", () => {
  const rows = [
    { title: "Mc Donalds", categoryId: "resto", kind: "expense" },
    { title: "mc donald's", categoryId: "resto", kind: "expense" },
    { title: "MC DONALDS 2", categoryId: "resto", kind: "expense" },
    { title: "Mc Donalds", categoryId: "cafe", kind: "expense" },
    { title: "Disco", categoryId: "super", kind: "expense" },
    { title: "Disco", categoryId: "salidas", kind: "expense" },
    { title: "Bajón Kinko", categoryId: "snacks", kind: "expense" },
    { title: "Bajon centro", categoryId: "snacks", kind: "expense" },
    { title: "Farmacia", categoryId: "salud", kind: "expense" },
    { title: "Sueldo", categoryId: "sueldo", kind: "income" },
  ];
  const classify = buildClassifier(rows);

  it("normTitle: sin tildes, números ni signos", () => {
    expect(normTitle("Café  Nº 2!")).toBe("cafe n");
    expect(normTitle("Bajón Kinko")).toBe("bajon kinko");
  });

  it("gana la categoría con al menos 60% de las veces", () => {
    expect(classify("Mc Donalds", "expense")).toEqual({ categoryId: "resto", confidence: "alta" });
    expect(classify("Disco", "expense")).toBeNull(); // 50 y 50
  });

  it("una sola vez: confianza media", () => {
    expect(classify("farmacia", "expense")).toEqual({ categoryId: "salud", confidence: "media" });
  });

  it("por primera palabra (con 2 o más veces)", () => {
    expect(classify("Bajon Pocitos", "expense")).toEqual({ categoryId: "snacks", confidence: "media" });
    expect(classify("Farmacia Pigalle", "expense")).toBeNull(); // la palabra se vio una sola vez
  });

  it("separa gastos de ingresos", () => {
    expect(classify("Sueldo", "expense")).toBeNull();
    expect(classify("Sueldo", "income")).toEqual({ categoryId: "sueldo", confidence: "media" });
    expect(classify("123", "expense")).toBeNull();
  });
});

describe("carga rápida (parseQuick)", () => {
  const accounts = [
    { id: "itau", name: "Itau", currency: "UYU" },
    { id: "itau-usd", name: "Itau USD", currency: "USD" },
    { id: "santander", name: "Santander", currency: "UYU" },
    { id: "mp", name: "Mercado Pago", currency: "UYU" },
  ];

  it("'350 almuerzo itau' va a Itau, no a Itau USD", () => {
    expect(parseQuick("350 almuerzo itau", accounts)).toEqual({
      amountCents: 35000,
      kind: "expense",
      title: "Almuerzo",
      accountId: "itau",
      currency: "UYU",
      daysAgo: 0,
    });
  });

  it("'itau usd' va a Itau USD", () => {
    expect(parseQuick("20 nafta itau usd", accounts)).toMatchObject({ accountId: "itau-usd", currency: "USD", amountCents: 2000, title: "Nafta" });
  });

  it("ingreso con + y ayer", () => {
    expect(parseQuick("+2450 disco santander ayer", accounts)).toEqual({
      amountCents: 245000,
      kind: "income",
      title: "Disco",
      accountId: "santander",
      currency: "UYU",
      daysAgo: 1,
    });
  });

  it("moneda sin cuenta, $ suelto, menos adelante y anteayer", () => {
    expect(parseQuick("usd 20 nafta", accounts)).toMatchObject({ currency: "USD", accountId: null, amountCents: 2000, title: "Nafta" });
    expect(parseQuick("$ 300 taxi", accounts)).toMatchObject({ amountCents: 30000, title: "Taxi", kind: "expense" });
    expect(parseQuick("-350 almuerzo", accounts)).toMatchObject({ amountCents: 35000, title: "Almuerzo", kind: "expense" });
    expect(parseQuick("1.250 super anteayer", accounts)).toMatchObject({ amountCents: 125000, title: "Super", daysAgo: 2 });
  });

  it("cuentas en el monto", () => {
    expect(parseQuick("20x3 almuerzo", accounts)).toMatchObject({ amountCents: 6000, title: "Almuerzo" });
    expect(parseQuick("1500/3 regalo", accounts)).toMatchObject({ amountCents: 50000, title: "Regalo" });
  });

  it("la cuenta solo al principio o al final", () => {
    expect(parseQuick("500 almuerzo con itau y amigos", accounts)).toMatchObject({ accountId: null, title: "Almuerzo con itau y amigos" });
    expect(parseQuick("350 itau almuerzo", accounts)).toMatchObject({ accountId: "itau", title: "Almuerzo" });
    expect(parseQuick("350 mercado almuerzo", accounts)).toMatchObject({ accountId: "mp", title: "Almuerzo" });
  });

  // BUG menor (smart-logic.ts:154): si el número del monto aparece otra vez en el texto, el
  // monto vuelve al título ("20 20 almuerzo" queda con título "20 20 almuerzo").
  it("el monto no vuelve al título aunque el número se repita", () => {
    expect(parseQuick("20 almuerzo 20", accounts)).toMatchObject({ amountCents: 2000, title: "Almuerzo 20" });
  });

  it("palabras de ingreso", () => {
    expect(parseQuick("cobré 1000 sueldo", accounts)).toMatchObject({ kind: "income", amountCents: 100000, title: "Sueldo" });
  });

  it("sin monto: null", () => {
    expect(parseQuick("almuerzo itau", accounts)).toBeNull();
    expect(parseQuick("   ", accounts)).toBeNull();
  });
});

describe("gastos fijos sugeridos (findFixedExpenses)", () => {
  const TODAY = "2026-10-19";
  const monthly = (title: string, months: string[], cents: number[] | number, day = 5, accountId = "itau"): FixedRow[] =>
    months.map((m, i) => ({ title, accountId, categoryId: "subs", cents: Array.isArray(cents) ? cents[i] : cents, date: `${m}-${String(day).padStart(2, "0")}` }));

  it("mismo título y cuenta en 3+ meses, monto estable y vigente", () => {
    const rows = monthly("Netflix", ["2026-07", "2026-08", "2026-09", "2026-10"], [39000, 39000, 41000, 42000]);
    const out = findFixedExpenses(rows, TODAY, new Set());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "netflix|itau", title: "Netflix", amountCents: 42000, day: 5, months: 4, lastDate: "2026-10-05", categoryId: "subs" });
  });

  it("descarta lo que no es fijo", () => {
    // Menos de 3 meses.
    expect(findFixedExpenses(monthly("Gym", ["2026-09", "2026-10"], 1000), TODAY, new Set())).toEqual([]);
    // No vigente (último en junio).
    expect(findFixedExpenses(monthly("Spotify", ["2026-04", "2026-05", "2026-06"], 1000), TODAY, new Set())).toEqual([]);
    // Monto inestable.
    expect(findFixedExpenses(monthly("Super", ["2026-07", "2026-08", "2026-09", "2026-10"], [1000, 3000, 500, 2000]), TODAY, new Set())).toEqual([]);
    // Varias veces por mes.
    const weekly = ["2026-08", "2026-09", "2026-10"].flatMap((m) => [1, 8, 15].map((d) => monthly("Feria", [m], 1000, d)[0]));
    expect(findFixedExpenses(weekly, TODAY, new Set())).toEqual([]);
    // Marcado "No es fijo".
    expect(findFixedExpenses(monthly("Netflix", ["2026-08", "2026-09", "2026-10"], 1000), TODAY, new Set(["netflix|itau"]))).toEqual([]);
  });

  it("vigente si apareció el mes pasado", () => {
    expect(findFixedExpenses(monthly("Antel", ["2026-07", "2026-08", "2026-09"], 1000), TODAY, new Set())).toHaveLength(1);
  });

  it("misma suscripción en otra cuenta es otra sugerencia", () => {
    const rows = [...monthly("Netflix", ["2026-08", "2026-09", "2026-10"], 1000), ...monthly("Netflix", ["2026-08", "2026-09", "2026-10"], 2000, 5, "santander")];
    const out = findFixedExpenses(rows, TODAY, new Set());
    expect(out.map((s) => s.key)).toEqual(["netflix|santander", "netflix|itau"]); // de mayor a menor monto
  });
});
