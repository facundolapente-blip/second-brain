/**
 * Árbol de objetivos (2026-10-25, sin base ni React): un objetivo escrito como venga se
 * parte en objetivos más chicos (que se pueden volver a partir) y cada uno en tareas
 * simples. El avance sube solo: tareas → objetivo chico → objetivo grande.
 */
import { krPct, objectivePct, type KeyResultDTO, type ObjectiveDTO, type StepDTO } from "./plan-logic";

/** Tareas de un objetivo chico en su orden (las hechas no se mueven: el orden es el de carga). */
export const byStepOrder = (a: StepDTO, b: StepDTO) => a.order - b.order || (a.date ?? "").localeCompare(b.date ?? "") || a.title.localeCompare(b.title);

/** Los que cuelgan directo del objetivo (sin padre, o con un padre que ya no está). */
export function rootsOf(krs: KeyResultDTO[]): KeyResultDTO[] {
  const ids = new Set(krs.map((k) => k.id));
  return krs.filter((k) => !k.parentId || !ids.has(k.parentId));
}

export function childrenOf(krs: KeyResultDTO[], id: string): KeyResultDTO[] {
  return krs.filter((k) => k.parentId === id && k.id !== id);
}

/** Todos los que salen de uno (hijos, nietos…), sin repetir aunque el árbol tuviera un ciclo. */
export function descendantsOf(krs: KeyResultDTO[], id: string): KeyResultDTO[] {
  const out: KeyResultDTO[] = [];
  const seen = new Set([id]);
  const walk = (pid: string) => {
    for (const c of childrenOf(krs, pid)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
      walk(c.id);
    }
  };
  walk(id);
  return out;
}

/** Las tareas de uno y de todo lo que sale de él. */
export function subtreeSteps(krs: KeyResultDTO[], k: KeyResultDTO): StepDTO[] {
  return [k, ...descendantsOf(krs, k.id)].flatMap((x) => x.steps);
}

/** "2/4": tareas hechas sobre tareas, contando las de los objetivos más chicos que salen de él. */
export function stepCount(krs: KeyResultDTO[], k: KeyResultDTO): { done: number; total: number } {
  const all = subtreeSteps(krs, k);
  return { done: all.filter((s) => s.done).length, total: all.length };
}

/**
 * Avance de un objetivo chico: el promedio de sus tareas (hecha = 1) y de los objetivos que
 * salen de él (su avance). Sin tareas ni hijos, lo de siempre: completado, meta a mano o lo
 * que se mide solo. null si no hay nada que medir.
 */
export function nodePct(krs: KeyResultDTO[], k: KeyResultDTO, seen: Set<string> = new Set()): number | null {
  if (seen.has(k.id)) return null;
  seen.add(k.id);
  const units: number[] = k.steps.map((s) => (s.done ? 1 : 0));
  for (const c of childrenOf(krs, k.id)) {
    const p = nodePct(krs, c, seen);
    if (p !== null) units.push(p / 100);
  }
  if (units.length) return Math.round((units.reduce((a, b) => a + b, 0) / units.length) * 100);
  return krPct(k);
}

/** Avance del objetivo grande: el promedio de los que cuelgan de él; sin ninguno, su meta propia. */
export function treePct(o: ObjectiveDTO): number | null {
  if (o.status === "done") return 100;
  const vals = rootsOf(o.keyResults)
    .map((k) => nodePct(o.keyResults, k))
    .filter((n): n is number => n !== null);
  if (vals.length) return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  return objectivePct(o);
}

/**
 * La próxima tarea de un objetivo: la agendada más cercana de hoy en adelante (por día y hora);
 * si no hay, la primera sin día en el orden del árbol; si solo quedan vencidas, la más reciente.
 * null si no queda ninguna.
 */
export function nextStep(o: ObjectiveDTO, today: string): (StepDTO & { goal: string }) | null {
  const open = treeOrder(o.keyResults)
    .flatMap((k) => [...k.steps].sort(byStepOrder).map((st) => ({ ...st, goal: k.title })))
    .filter((st) => !st.done);
  const key = (st: StepDTO) => `${st.date} ${st.startTime ?? ""}`;
  const coming = open.filter((st) => st.date && st.date >= today).sort((a, b) => key(a).localeCompare(key(b)));
  const late = open.filter((st) => st.date && st.date < today).sort((a, b) => key(b).localeCompare(key(a)));
  return coming[0] ?? open.find((st) => !st.date) ?? late[0] ?? null;
}

/** Los objetivos chicos en el orden en que se ven (cada uno seguido de lo que sale de él). */
export function treeOrder(krs: KeyResultDTO[]): KeyResultDTO[] {
  const out: KeyResultDTO[] = [];
  const seen = new Set<string>();
  const walk = (list: KeyResultDTO[]) => {
    for (const k of list) {
      if (seen.has(k.id)) continue;
      seen.add(k.id);
      out.push(k);
      walk(childrenOf(krs, k.id));
    }
  };
  walk(rootsOf(krs));
  return out;
}


const DAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTH = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** "hoy", "mañana", "ayer" o "jue 30" (con la hora si tiene: "jue 30 · 18:00"). */
export function whenLabel(date: string, startTime: string | null, today: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const t = new Date(`${today}T00:00:00Z`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  // Esta semana y la que viene, con el día ("jue 29"); más lejos, con el mes ("4 oct").
  const day =
    diff === 0
      ? "hoy"
      : diff === 1
        ? "mañana"
        : diff === -1
          ? "ayer"
          : Math.abs(diff) <= 6
            ? `${DAY[d.getUTCDay()]} ${d.getUTCDate()}`
            : `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
  return startTime ? `${day} · ${startTime}` : day;
}


/** Un objetivo chico está logrado si se marcó completado o si sus tareas (y sus hijos) llegaron al 100 %. */
export function isAchieved(krs: KeyResultDTO[], k: KeyResultDTO): boolean {
  if (k.status === "done") return true;
  return (k.steps.length > 0 || childrenOf(krs, k.id).length > 0) && nodePct(krs, k) === 100;
}

/**
 * Los objetivos chicos de un objetivo (solo los de arriba; los hijos van debajo de su padre),
 * en tres grupos: los de ahora (sin trimestre, o del trimestre en curso o uno que viene), los
 * logrados y los que quedaron sin terminar (cerrados, o de un trimestre que ya pasó).
 */
export function groupGoals(krs: KeyResultDTO[], year: number, today: string): { now: KeyResultDTO[]; achieved: KeyResultDTO[]; unfinished: KeyResultDTO[] } {
  const thisYear = Number(today.slice(0, 4));
  const nowQ = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;
  const pastOnly = (k: KeyResultDTO) => year < thisYear || (year === thisYear && k.quarters.length > 0 && k.quarters.every((q) => Number(q.slice(1)) < nowQ));
  const out = { now: [] as KeyResultDTO[], achieved: [] as KeyResultDTO[], unfinished: [] as KeyResultDTO[] };
  for (const k of rootsOf(krs)) {
    if (isAchieved(krs, k)) out.achieved.push(k);
    else if (k.status === "closed" || pastOnly(k)) out.unfinished.push(k);
    else out.now.push(k);
  }
  return out;
}

/** Cómo quedó cada trimestre en la línea Q1 → Q4: cuántos tenía y cuántos se lograron. */
export type QuarterStop = { q: "Q1" | "Q2" | "Q3" | "Q4"; total: number; done: number; when: "past" | "now" | "future" };

export function quarterPath(krs: KeyResultDTO[], year: number, today: string): QuarterStop[] {
  const thisYear = Number(today.slice(0, 4));
  const nowQ = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;
  return (["Q1", "Q2", "Q3", "Q4"] as const).map((q, i) => {
    const list = krs.filter((k) => k.quarters.includes(q));
    const n = i + 1;
    const when = year < thisYear || (year === thisYear && n < nowQ) ? "past" : year === thisYear && n === nowQ ? "now" : "future";
    return { q, total: list.length, done: list.filter((k) => isAchieved(krs, k)).length, when };
  });
}

/** Del objetivo chico hasta arriba: sus padres, del más grande al más chico (para la miga de pan). */
export function ancestorsOf(krs: KeyResultDTO[], k: KeyResultDTO): KeyResultDTO[] {
  const out: KeyResultDTO[] = [];
  const seen = new Set([k.id]);
  let cur = k.parentId ? krs.find((x) => x.id === k.parentId) : undefined;
  while (cur && !seen.has(cur.id)) {
    out.unshift(cur);
    seen.add(cur.id);
    cur = cur.parentId ? krs.find((x) => x.id === cur!.parentId) : undefined;
  }
  return out;
}
