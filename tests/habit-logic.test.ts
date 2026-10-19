import { describe, expect, it } from "vitest";
import {
  bestStreak,
  cleanDays,
  currentStreak,
  dayProgress,
  dayState,
  doneCounts,
  frequencyLabel,
  habitDayMark,
  habitScore,
  hasScore,
  isScheduled,
  nextStatus,
  packAll,
  packLogs,
  periodStart,
  periodSummary,
  showsOn,
  trackStats,
  unpackAll,
  weekProgress,
  type DayLog,
  type HabitRule,
  type LogMap,
  type PastTrack,
} from "@/lib/habit-logic";
import { addDays } from "@/lib/dates";

// Octubre de 2026: lunes 5, 12, 19 y 26. "Hoy" en casi todo es el lunes 19.
const TODAY = "2026-10-19";

function rule(over: Partial<HabitRule> = {}): HabitRule {
  return { frequency: "daily", weekdays: [], timesPerWeek: 1, target: 1, startDate: "2026-10-12", weekStart: 1, ...over };
}

const CODES: Record<string, DayLog["s"]> = { d: "done", f: "failed", s: "skipped", o: "none" };

/** Marcas cortas: { "2026-10-12": "d" } (d hecho, f fallado, s salteado, o solo nota). */
function L(m: Record<string, string | DayLog>): LogMap {
  const out: LogMap = {};
  for (const [d, v] of Object.entries(m)) out[d] = typeof v === "string" ? { s: CODES[v], v: 1 } : v;
  return out;
}

/** Hecho todos los días de `from` a `to` (inclusive). */
function doneRange(from: string, to: string, extra: Record<string, string> = {}): LogMap {
  const m: Record<string, string> = {};
  for (let d = from; d <= to; d = addDays(d, 1)) m[d] = "d";
  return L({ ...m, ...extra });
}

describe("frequencyLabel", () => {
  it("describe la frecuencia", () => {
    expect(frequencyLabel(rule())).toBe("Todos los días");
    expect(frequencyLabel(rule({ frequency: "weekdays", weekdays: [5, 1, 3] }))).toBe("Lun, Mié, Vie");
    expect(frequencyLabel(rule({ frequency: "weekdays", weekdays: [0, 1] }))).toBe("Lun, Dom");
    expect(frequencyLabel(rule({ frequency: "weekdays", weekdays: [0, 1, 2, 3, 4, 5, 6] }))).toBe("Todos los días");
    expect(frequencyLabel(rule({ frequency: "weekdays", weekdays: [] }))).toBe("Sin días");
    expect(frequencyLabel(rule({ frequency: "weekly", timesPerWeek: 1 }))).toBe("1 vez a la semana");
    expect(frequencyLabel(rule({ frequency: "weekly", timesPerWeek: 3 }))).toBe("3 veces a la semana");
  });
});

describe("estado de un día (dayState)", () => {
  const h = rule();

  it("antes del inicio, hecho, fallado", () => {
    expect(dayState(h, {}, "2026-10-11", TODAY)).toBe("before");
    expect(dayState(h, L({ "2026-10-13": "d" }), "2026-10-13", TODAY)).toBe("done");
    expect(dayState(h, L({ "2026-10-13": "f" }), "2026-10-13", TODAY)).toBe("failed");
  });

  it("salteado: pasado se ve salteado, hoy queda pendiente, futuro sin tocar", () => {
    expect(dayState(h, L({ "2026-10-13": "s" }), "2026-10-13", TODAY)).toBe("skipped");
    expect(dayState(h, L({ [TODAY]: "s" }), TODAY, TODAY)).toBe("pending");
    expect(dayState(h, L({ "2026-10-20": "s" }), "2026-10-20", TODAY)).toBe("idle");
  });

  it("sin marcar: pasado amarillo, hoy pendiente, futuro idle", () => {
    expect(dayState(h, {}, "2026-10-14", TODAY)).toBe("unmarked");
    expect(dayState(h, {}, TODAY, TODAY)).toBe("pending");
    expect(dayState(h, {}, "2026-10-21", TODAY)).toBe("idle");
  });

  it("cantidad: hecho solo si llega a la meta, si no parcial", () => {
    const q = rule({ target: 5 });
    expect(dayState(q, L({ "2026-10-13": { s: "done", v: 3 } }), "2026-10-13", TODAY)).toBe("partial");
    expect(dayState(q, L({ "2026-10-13": { s: "done", v: 5 } }), "2026-10-13", TODAY)).toBe("done");
    expect(dayState(q, L({ "2026-10-13": { s: "done", v: 8 } }), "2026-10-13", TODAY)).toBe("done");
  });

  it("días fijos: un día que no toca es idle", () => {
    const w = rule({ frequency: "weekdays", weekdays: [1, 3, 5] });
    expect(isScheduled(w, "2026-10-13")).toBe(false); // martes
    expect(isScheduled(w, "2026-10-14")).toBe(true); // miércoles
    expect(dayState(w, {}, "2026-10-13", TODAY)).toBe("idle");
    expect(dayState(w, {}, "2026-10-14", TODAY)).toBe("unmarked");
  });
});

describe("rachas (diarios y días fijos)", () => {
  const h = rule();

  it("hoy sin marcar no corta la racha; hoy hecho suma", () => {
    expect(currentStreak(h, doneRange("2026-10-12", "2026-10-18"), TODAY)).toBe(7);
    expect(currentStreak(h, doneRange("2026-10-12", TODAY), TODAY)).toBe(8);
  });

  it("hoy fallado la corta", () => {
    expect(currentStreak(h, doneRange("2026-10-12", "2026-10-18", { [TODAY]: "f" }), TODAY)).toBe(0);
  });

  it("los salteados no la cortan ni la suman", () => {
    expect(currentStreak(h, doneRange("2026-10-12", "2026-10-18", { "2026-10-15": "s" }), TODAY)).toBe(6);
  });

  it("un fallado o un día sin marcar en el medio la corta", () => {
    expect(currentStreak(h, doneRange("2026-10-12", "2026-10-18", { "2026-10-17": "f" }), TODAY)).toBe(1);
    const gap = doneRange("2026-10-12", "2026-10-18");
    delete gap["2026-10-16"];
    expect(currentStreak(h, gap, TODAY)).toBe(2);
  });

  it("mejor racha", () => {
    const logs = L({ "2026-10-12": "d", "2026-10-13": "d", "2026-10-14": "d", "2026-10-15": "f", "2026-10-16": "d", "2026-10-17": "d" });
    expect(bestStreak(h, logs, TODAY)).toBe(3);
    expect(bestStreak(h, doneRange("2026-10-12", TODAY), TODAY)).toBe(8);
  });

  it("días fijos: los días que no tocan no cuentan", () => {
    const w = rule({ frequency: "weekdays", weekdays: [1, 3, 5] });
    const logs = L({ "2026-10-12": "d", "2026-10-14": "d", "2026-10-16": "d" });
    expect(currentStreak(w, logs, TODAY)).toBe(3);
    expect(bestStreak(w, logs, TODAY)).toBe(3);
  });
});

describe("puntaje (habitScore)", () => {
  it("diarios: hechos sobre días que tocaban; hoy entra solo si está hecho", () => {
    const h = rule();
    // 12 al 16 hechos, 17 sin marcar, 18 fallado; hoy sin marcar no entra: 5 de 7.
    const logs = doneRange("2026-10-12", "2026-10-16", { "2026-10-18": "f" });
    expect(habitScore(h, logs, TODAY)).toBe(71);
    // Hoy hecho: 6 de 8.
    expect(habitScore(h, { ...logs, [TODAY]: { s: "done", v: 1 } }, TODAY)).toBe(75);
  });

  it("diarios: un salteado cuenta como no hecho", () => {
    const h = rule();
    expect(habitScore(h, doneRange("2026-10-12", "2026-10-18", { "2026-10-15": "s" }), TODAY)).toBe(86);
  });

  it("hábito nuevo sin nada que medir: 0 y sin puntaje", () => {
    const h = rule({ startDate: TODAY });
    expect(habitScore(h, {}, TODAY)).toBe(0);
    expect(hasScore(h, {}, TODAY)).toBe(false);
    expect(hasScore(rule(), {}, TODAY)).toBe(true);
  });
});

describe("semanales (X veces por semana)", () => {
  // 3 veces por semana desde el sábado 3: la primera semana (lunes 28/9 a domingo 4/10) tiene 2 días.
  const h = rule({ frequency: "weekly", timesPerWeek: 3, startDate: "2026-10-03" });
  const logs = L({
    "2026-10-03": "d",
    "2026-10-04": "d", // semana 1: 2 de 2 (prorrateada)
    "2026-10-05": "d",
    "2026-10-06": "d",
    "2026-10-07": "s", // semana 2: 2 de 3 (el salteado no baja la meta)
    "2026-10-12": "d",
    "2026-10-13": "d",
    "2026-10-14": "d",
    "2026-10-15": "f", // semana 3: 3 de 3 (con un fallado que no hacía falta)
  });

  it("la primera semana se prorratea con los días que tuvo", () => {
    expect(weekProgress(h, logs, "2026-10-03")).toEqual({ done: 2, need: 2 });
    expect(weekProgress(rule({ frequency: "weekly", timesPerWeek: 3, startDate: "2026-10-01" }), {}, "2026-10-01")).toEqual({
      done: 0,
      need: 3,
    });
  });

  it("los salteados no bajan la meta", () => {
    expect(weekProgress(h, logs, "2026-10-07")).toEqual({ done: 2, need: 3 });
  });

  it("weekProgress es null en los que no son semanales", () => {
    expect(weekProgress(rule(), logs, TODAY)).toBeNull();
  });

  it("puntaje: la semana en curso entra solo si ya se cumplió", () => {
    // (1 + 2/3 + 1) / 3 = 89; la semana del 19 (0 de 3) no entra.
    expect(habitScore(h, logs, TODAY)).toBe(89);
    const once = rule({ frequency: "weekly", timesPerWeek: 1, startDate: "2026-10-12" });
    expect(habitScore(once, L({ "2026-10-12": "d" }), TODAY)).toBe(100);
    // Semana en curso cumplida: entra (2 de 2 semanas).
    expect(habitScore(once, L({ "2026-10-12": "d", [TODAY]: "d" }), TODAY)).toBe(100);
    expect(habitScore(once, L({ [TODAY]: "d" }), TODAY)).toBe(50);
  });

  it("racha y mejor racha en semanas; la semana en curso no la corta", () => {
    expect(currentStreak(h, logs, TODAY)).toBe(1);
    expect(bestStreak(h, logs, TODAY)).toBe(1);
    const all = { ...logs, "2026-10-07": { s: "done" as const, v: 1 } };
    expect(currentStreak(h, all, TODAY)).toBe(3);
    expect(bestStreak(h, all, TODAY)).toBe(3);
  });

  it("estado: fallado en semana cumplida = missed; sin marcar en semana cumplida = idle", () => {
    expect(dayState(h, logs, "2026-10-15", TODAY)).toBe("missed");
    expect(dayState(h, logs, "2026-10-16", TODAY)).toBe("idle");
    // Semana pasada sin cumplir: el día sin marcar cuenta como falla.
    expect(dayState(h, logs, "2026-10-08", TODAY)).toBe("unmarked");
    // Semana en curso: hoy pendiente, días que siguen sin tocar.
    expect(dayState(h, logs, TODAY, TODAY)).toBe("pending");
    expect(dayState(h, logs, "2026-10-21", TODAY)).toBe("idle");
  });

  it("estado: en la semana en curso un día pasado sin marcar todavía no es falla", () => {
    expect(dayState(h, logs, "2026-10-19", "2026-10-21")).toBe("idle");
  });

  it("showsOn: con la meta cumplida no aparece el resto de la semana (el día marcado sí)", () => {
    expect(showsOn(h, logs, "2026-10-15")).toBe(true); // tiene marca
    expect(showsOn(h, logs, "2026-10-16")).toBe(false);
    expect(showsOn(h, logs, "2026-10-08")).toBe(true); // semana sin cumplir
    expect(showsOn(h, logs, TODAY)).toBe(true);
    expect(showsOn(h, logs, "2026-10-02")).toBe(false); // antes del inicio
  });

  it("la semana puede empezar el domingo", () => {
    expect(periodStart({ weekStart: 0 }, TODAY)).toBe("2026-10-18");
    expect(periodStart({ weekStart: 1 }, TODAY)).toBe("2026-10-19");
    const sun = rule({ frequency: "weekly", timesPerWeek: 2, startDate: "2026-10-11", weekStart: 0 });
    // Domingo 18 y lunes 19 son de la misma semana si arranca el domingo.
    expect(weekProgress(sun, L({ "2026-10-18": "d", [TODAY]: "d" }), TODAY)).toEqual({ done: 2, need: 2 });
  });

  it("periodSummary: la semana en curso sin completar ya cuenta como incompleta", () => {
    expect(periodSummary(h, logs, TODAY)).toEqual({ achieved: 2, missed: 2 });
  });
});

describe("dayProgress", () => {
  const a = { ...rule(), id: "a" };
  const b = { ...rule({ frequency: "weekly", timesPerWeek: 3, startDate: "2026-10-12" }), id: "b" };
  const logsB = L({ "2026-10-12": "d", "2026-10-13": "d", "2026-10-14": "d", "2026-10-15": "f" });

  it("un fallado en una semana cumplida (missed) no cuenta", () => {
    expect(dayProgress([a, b], { a: L({ "2026-10-15": "d" }), b: logsB }, "2026-10-15", TODAY)).toEqual({ done: 1, total: 1 });
  });

  it("los salteados no cuentan (si no, nunca se llega a Día completo)", () => {
    expect(dayProgress([a], { a: L({ "2026-10-15": "s" }) }, "2026-10-15", TODAY)).toEqual({ done: 0, total: 0 });
  });

  it("un semanal que ya cumplió con otros días no aparece", () => {
    expect(dayProgress([a, b], { a: {}, b: logsB }, "2026-10-16", TODAY)).toEqual({ done: 0, total: 1 });
  });

  it("cuenta lo que toca y lo hecho", () => {
    expect(dayProgress([a, b], { a: L({ [TODAY]: "d" }) }, TODAY, TODAY)).toEqual({ done: 1, total: 2 });
    expect(dayProgress([a], {}, "2026-10-11", TODAY)).toEqual({ done: 0, total: 0 }); // antes del inicio
  });
});

describe("habitDayMark (cifras fuera de Hábitos)", () => {
  const h = { ...rule(), id: "h" };

  it("hecho, abierto hoy, fallado o sin marcar en el pasado", () => {
    const logs = L({ "2026-10-18": "d", "2026-10-16": "f" });
    expect(habitDayMark(h, logs, "2026-10-18", TODAY)).toBe("done");
    expect(habitDayMark(h, logs, TODAY, TODAY)).toBe("open");
    expect(habitDayMark(h, logs, "2026-10-17", TODAY)).toBe("missed");
    expect(habitDayMark(h, logs, "2026-10-16", TODAY)).toBe("missed");
    expect(habitDayMark(h, logs, "2026-10-11", TODAY)).toBeNull();
  });

  it("semanal en una semana que no terminó: open", () => {
    const w = { ...rule({ frequency: "weekly", timesPerWeek: 3 }), id: "w" };
    expect(habitDayMark(w, {}, "2026-10-19", "2026-10-21")).toBe("open");
    expect(habitDayMark(w, {}, "2026-10-13", "2026-10-21")).toBe("missed");
  });

  it("archivado: cuenta hasta el día antes de archivarse", () => {
    const arch = { ...h, archivedOn: "2026-10-17" };
    expect(habitDayMark(arch, {}, "2026-10-18", TODAY)).toBeNull();
    expect(habitDayMark(arch, {}, "2026-10-17", TODAY)).toBeNull();
    expect(habitDayMark(arch, L({ "2026-10-17": "d" }), "2026-10-17", TODAY)).toBe("done");
    expect(habitDayMark(arch, {}, "2026-10-16", TODAY)).toBe("missed");
    expect(habitDayMark(arch, L({ "2026-10-16": "d" }), "2026-10-16", TODAY)).toBe("done");
  });
});

describe("pistas (trackStats y trackEnd)", () => {
  // Pista vieja: 2 veces por semana del 28/9 al 11/10. Actual: diaria desde el 12/10.
  const h = rule({ startDate: "2026-10-12" });
  const tracks: PastTrack[] = [
    { frequency: "weekly", weekdays: [], timesPerWeek: 2, weekStart: 1, target: 1, startDate: "2026-09-28", endDate: "2026-10-11" },
  ];
  const logs = { ...L({ "2026-09-28": "d", "2026-09-30": "d", "2026-10-05": "d" }), ...doneRange("2026-10-12", "2026-10-18") };

  it("pista actual: solo sus marcas", () => {
    const s = trackStats(h, tracks, logs, TODAY, "current");
    expect(s.score).toBe(100);
    expect(s.streak).toBe(7);
    expect(s.best).toBe(7);
    expect(s.from).toBe("2026-10-12");
    expect(Object.keys(s.logs).every((d) => d >= "2026-10-12")).toBe(true);
  });

  it("pista vieja: se evalúa con hoy = día siguiente a su fin", () => {
    const s = trackStats(h, tracks, logs, TODAY, 0);
    expect(s.score).toBe(75); // (1 + 1/2) / 2
    expect(s.streak).toBe(0); // su última semana no se cumplió y ya no está en curso
    expect(s.best).toBe(1);
    expect(s.periods).toEqual({ achieved: 1, missed: 1 });
    expect(s.stateOf("2026-10-13")).toBe("idle");
    // Su última semana ya terminó: un día sin marcar es falla.
    expect(s.stateOf("2026-10-06")).toBe("unmarked");
    expect(Object.keys(s.logs).sort()).toEqual(["2026-09-28", "2026-09-30", "2026-10-05"]);
  });

  it("todas: cada pista con su configuración, sumadas", () => {
    const s = trackStats(h, tracks, logs, TODAY, "all");
    expect(s.score).toBe(94); // (1.5 + 7) / (2 + 7)
    expect(s.best).toBe(7);
    expect(s.streak).toBe(7);
    expect(s.periods).toEqual({ achieved: 8, missed: 1 });
    expect(s.from).toBe("2026-09-28");
    expect(s.stateOf("2026-09-28")).toBe("done");
    expect(s.stateOf("2026-09-27")).toBe("before");
  });

  it("un índice de pista que no existe usa la actual", () => {
    expect(trackStats(h, tracks, logs, TODAY, 5).from).toBe("2026-10-12");
  });

  it("trackEnd: después del fin no toca nada y la última semana se prorratea", () => {
    const closed = rule({ frequency: "weekly", timesPerWeek: 3, startDate: "2026-09-28", trackEnd: "2026-10-06" });
    expect(isScheduled(closed, "2026-10-07")).toBe(false);
    expect(isScheduled(closed, "2026-10-06")).toBe(true);
    expect(weekProgress(closed, {}, "2026-10-05")).toEqual({ done: 0, need: 2 });
  });
});

describe("doneCounts y nextStatus", () => {
  it("veces hecho en semana, mes, año y total", () => {
    const logs = L({ "2025-12-31": "d", "2026-09-30": "d", "2026-10-02": "d", "2026-10-19": "d", "2026-10-18": "f" });
    expect(doneCounts(rule(), logs, TODAY)).toEqual({ week: 1, month: 2, year: 3, total: 4 });
  });

  it("tocar rota: nada → hecho → fallado → nada", () => {
    expect(nextStatus(undefined)).toBe("done");
    expect(nextStatus({ s: "none", v: 0, n: "nota" })).toBe("done");
    expect(nextStatus({ s: "done", v: 1 })).toBe("failed");
    expect(nextStatus({ s: "failed", v: 1 })).toBeNull();
    expect(nextStatus({ s: "skipped", v: 1 })).toBeNull();
  });
});

describe("días limpios (cleanDays)", () => {
  const h = { startDate: "2026-10-01" };

  it("sin fallados: desde el inicio", () => {
    expect(cleanDays(h, {}, TODAY)).toEqual({ current: 19, best: 19 });
  });

  it("con fallados: días seguidos y récord", () => {
    expect(cleanDays(h, L({ "2026-10-05": "f", "2026-10-10": "f" }), TODAY)).toEqual({ current: 9, best: 9 });
    expect(cleanDays(h, L({ "2026-10-15": "f" }), TODAY)).toEqual({ current: 4, best: 14 });
  });

  it("fallado hoy: 0", () => {
    expect(cleanDays(h, L({ [TODAY]: "f" }), TODAY).current).toBe(0);
  });

  it("los hechos o salteados no cortan", () => {
    expect(cleanDays(h, L({ "2026-10-05": "d", "2026-10-06": "s" }), TODAY).current).toBe(19);
  });
});

describe("marcas compactas (packAll / unpackAll)", () => {
  const logs: Record<string, LogMap> = {
    a: {
      "2026-10-01": { s: "done", v: 1 },
      "2026-10-03": { s: "failed", v: 1 },
      "2026-10-04": { s: "skipped", v: 1 },
      "2026-10-06": { s: "none", v: 0, n: "solo nota" },
      "2026-11-02": { s: "done", v: 3, n: "tres" },
    },
    vacio: {},
  };

  it("ida y vuelta sin perder nada", () => {
    expect(unpackAll(packAll(logs))).toEqual(logs);
  });

  it("un carácter por día", () => {
    const p = packLogs(logs.a)!;
    expect(p.from).toBe("2026-10-01");
    expect(p.s.slice(0, 6)).toBe("d.fs.o");
    expect(p.s.length).toBe(33);
    expect(p.v).toEqual({ 5: 0, 32: 3 });
    expect(p.n).toEqual({ 5: "solo nota", 32: "tres" });
    expect(packLogs({})).toBeNull();
  });
});
