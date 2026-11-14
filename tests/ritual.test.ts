import { describe, expect, it } from "vitest";
import {
  applyRitualPatch,
  cleanRitualPatch,
  emptyRitual,
  frogCandidates,
  isRitualDay,
  isRitualDone,
  ritualStage,
  ritualStreak,
  ritualWeek,
  type FrogTaskInput,
  type RitualDTO,
} from "@/lib/ritual-logic";

const today = "2026-11-16";
const task = (t: Partial<FrogTaskInput> & { id: string }): FrogTaskInput => ({
  title: t.id,
  status: "todo",
  priority: 1,
  deadline: null,
  passes: 0,
  category: null,
  ...t,
});
const r = (p: Partial<RitualDTO> = {}): RitualDTO => ({ ...emptyRitual(today), ...p });

describe("ritual: el sapo", () => {
  it("primero las vencidas (la más vieja), después prioridad, después las que se pasaron de semana, después la fecha", () => {
    const list = frogCandidates(
      [
        task({ id: "lejos", deadline: "2026-11-30" }),
        task({ id: "pasada", passes: 3 }),
        task({ id: "alta", priority: 3 }),
        task({ id: "urgente", priority: 4 }),
        task({ id: "vencida-ayer", deadline: "2026-11-15" }),
        task({ id: "vencida-vieja", deadline: "2026-11-12" }),
        task({ id: "terminada", status: "done", priority: 4 }),
        task({ id: "algun-dia", status: "backlog", priority: 4 }),
      ],
      today,
      10,
    );
    expect(list.map((t) => t.id)).toEqual(["vencida-vieja", "vencida-ayer", "urgente", "alta", "pasada", "lejos"]);
  });
  it("hasta 3 y con el porqué", () => {
    const list = frogCandidates([task({ id: "a", deadline: "2026-11-12", priority: 3 }), task({ id: "b", passes: 2 }), task({ id: "c" }), task({ id: "d" })], today);
    expect(list).toHaveLength(3);
    expect(list[0].reasons.map((x) => x.text)).toEqual(["Vencida hace 4 días", "Prioridad alta"]);
    expect(list[1].reasons[0].text).toBe("Pasada 2 veces");
    expect(list[2].reasons[0].text).toBe("Sin empezar");
  });
  it("una programada sin fecha no se propone; con fecha, sí", () => {
    expect(frogCandidates([task({ id: "x", status: "backlog" })], today)).toHaveLength(0);
    expect(frogCandidates([task({ id: "x", status: "backlog", deadline: "2026-11-17" })], today)[0].reasons[0].text).toBe("Vence mañana");
  });
});

describe("ritual: estados", () => {
  it("a la mañana, armado, a la noche y salteado", () => {
    expect(ritualStage(r(), 8)).toBe("morning");
    // Con la tarea prioritaria elegida (o con "Listo") queda armado.
    expect(ritualStage(r({ frogTitle: "y" }), 8)).toBe("done");
    expect(ritualStage(r({ completedAt: "2026-11-16T11:00:00Z" }), 8)).toBe("done");
    // A la noche pregunta si se hizo; hecha, ya no.
    expect(ritualStage(r({ frogTitle: "y" }), 19)).toBe("night");
    expect(ritualStage(r({ frogTitle: "y", frogDoneAt: "2026-11-16T12:00:00Z" }), 21)).toBe("done");
    expect(ritualStage(r({ skipped: true, frogTitle: "y" }), 21)).toBe("skipped");
    // Mientras se elige (o se tocó Cambiar) no se pliega.
    expect(ritualStage(r({ frogTitle: "y" }), 8, true)).toBe("morning");
    // Sin tarea prioritaria, a la noche no hay nada que preguntar.
    expect(ritualStage(r({ completedAt: "2026-11-16T11:00:00Z" }), 22)).toBe("done");
    expect(ritualStage(r(), 22)).toBe("morning");
  });
  it("salteado no cuenta como hecho", () => {
    expect(isRitualDone(r({ skipped: true, frogTitle: "y" }))).toBe(false);
    expect(isRitualDone(r({ frogTitle: "y" }))).toBe(true);
    expect(isRitualDone(r())).toBe(false);
  });
});

describe("ritual: datos", () => {
  it("limpia lo que llega del cliente", () => {
    expect(cleanRitualPatch({ frogTaskId: "abc", frogTitle: "  Llamar   al contador " })).toEqual({ frogTaskId: "abc", frogTitle: "Llamar al contador" });
    // La misión ya no existe: si quedó algo en la cola sin conexión, se ignora.
    expect(cleanRitualPatch({ mission: "termino la tienda", missionResult: "yes" })).toEqual({});
    expect(cleanRitualPatch({ frogTaskId: "abc", frogTitle: "" })).toEqual({ frogTaskId: null, frogTitle: null });
    expect(cleanRitualPatch({ frogDoneAt: "no" })).toEqual({ frogDoneAt: null });
    expect(cleanRitualPatch({ skipped: "si", completed: true })).toEqual({ skipped: false, completed: true });
    expect(cleanRitualPatch(null)).toEqual({});
  });
  it("cambiar de sapo borra lo comido", () => {
    const eaten = r({ frogTitle: "a", frogTaskId: "1", frogDoneAt: "2026-11-16T12:00:00Z" });
    expect(applyRitualPatch(eaten, { frogTaskId: "2", frogTitle: "b" }).frogDoneAt).toBeNull();
    expect(applyRitualPatch(eaten, { frogTaskId: "1", frogTitle: "a" }).frogDoneAt).toBe("2026-11-16T12:00:00Z");
    const now = new Date("2026-11-16T13:00:00Z");
    expect(applyRitualPatch(r(), { completed: true }, now).completedAt).toBe(now.toISOString());
  });
  it("días que se pueden guardar: hoy y la última semana", () => {
    expect(isRitualDay(today, today)).toBe(true);
    expect(isRitualDay("2026-11-09", today)).toBe(true);
    expect(isRitualDay("2026-11-08", today)).toBe(false);
    expect(isRitualDay("2026-11-17", today)).toBe(false);
  });
});

describe("ritual: racha y semana", () => {
  it("la racha cuenta desde ayer si hoy todavía no", () => {
    expect(ritualStreak(["2026-11-14", "2026-11-15"], today)).toBe(2);
    expect(ritualStreak(["2026-11-14", "2026-11-15", today], today)).toBe(3);
    expect(ritualStreak(["2026-11-13", "2026-11-15"], today)).toBe(1);
    expect(ritualStreak([], today)).toBe(0);
  });
  it("la semana para la revisión", () => {
    expect(ritualWeek([])).toBeNull();
    expect(ritualWeek([r({ skipped: true, frogTitle: "x" })])).toBeNull();
    // Un "Listo" sin tarea prioritaria no suma nada que mostrar.
    expect(ritualWeek([r({ completedAt: "2026-11-16T11:00:00Z" })])).toBeNull();
    expect(
      ritualWeek([
        r({ frogTitle: "s", frogDoneAt: "2026-11-16T12:00:00Z" }),
        r({ frogTitle: "t" }),
        r({ completedAt: "2026-11-16T11:00:00Z" }),
      ]),
    ).toEqual({ frogs: 2, eaten: 1 });
  });
});
