"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { haptic } from "@/components/haptics";
import { todayISO } from "./dates";
import { breakAfter, DEFAULT_FOCUS_SETTINGS, focusedMinutes, MIN_SAVE_MS, modeMs, type FocusMode, type FocusSettings } from "./focus-logic";

/**
 * El temporizador de enfoque vive en el aparato (no en el servidor): un almacén chico
 * guardado en localStorage (`sb_enfoque`), así sobrevive a cambiar de pantalla y a
 * recargar. Lo que falta se calcula siempre con la hora (`endsAt - Date.now()`), no
 * contando ticks: un intervalo atrasado (pestaña en segundo plano) no corre el reloj.
 * La píldora del Shell (`FocusPill`) lo tiene suscripto en toda la app, así el fin
 * se detecta en cualquier pantalla.
 */
export type FocusLink = { taskId?: string | null; blockId?: string | null; title?: string | null };

/** Sesión de enfoque terminada que falta anotar (abre la hoja "Sesión terminada"). */
export type FocusEnded = { startedAt: number; endedAt: number; minutes: number; link: FocusLink | null };

export type FocusTimerState = {
  mode: FocusMode;
  status: "idle" | "running" | "paused" | "ended";
  /** Lo que dura esta parte (ms). */
  durationMs: number;
  /** Corriendo: cuándo termina. */
  endsAt: number | null;
  /** En pausa o sin empezar: lo que falta. */
  remainingMs: number;
  /** Cuándo arrancó esta sesión (el primer "Empezar"). */
  startedAt: number | null;
  /** Sesiones de enfoque terminadas hoy (para "sesión 2 de 4" y el descanso largo). */
  done: number;
  doneDay: string;
  link: FocusLink | null;
  ended: FocusEnded | null;
  settings: FocusSettings;
};

const KEY = "sb_enfoque";

function initial(settings: FocusSettings = DEFAULT_FOCUS_SETTINGS): FocusTimerState {
  const durationMs = modeMs("focus", settings);
  return { mode: "focus", status: "idle", durationMs, endsAt: null, remainingMs: durationMs, startedAt: null, done: 0, doneDay: "", link: null, ended: null, settings };
}

const SERVER = initial();
let state: FocusTimerState | null = null;
const listeners = new Set<() => void>();

function load(): FocusTimerState {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<FocusTimerState>) : null;
    state = parsed && typeof parsed === "object" && parsed.mode && parsed.status ? { ...initial(parsed.settings ?? DEFAULT_FOCUS_SETTINGS), ...parsed } : initial();
  } catch {
    state = initial();
  }
  return state;
}

function set(next: FocusTimerState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Sin almacenamiento (modo privado): sigue en memoria hasta cerrar.
  }
  schedule();
  for (const l of listeners) l();
}

/** Las sesiones del día: otro día arranca de cero. */
function doneToday(s: FocusTimerState): number {
  return s.doneDay === todayISO() ? s.done : 0;
}

export function remainingOf(s: FocusTimerState, now = Date.now()): number {
  if (s.status === "running" && s.endsAt) return Math.max(0, s.endsAt - now);
  if (s.status === "ended") return 0;
  return s.remainingMs;
}

// ─── Fin del tiempo: vibrar, sonar y (si ya hay permiso) avisar ────────────────

let audio: AudioContext | null = null;
/** El sonido necesita un toque previo: se prepara al "Empezar". */
export function primeAudio() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    audio = null;
  }
}

function beep() {
  try {
    if (!audio) primeAudio();
    const ctx = audio;
    if (!ctx) return;
    // Dos notas cortas y suaves.
    [0, 0.22].forEach((at, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = i ? 1046 : 784;
      const t = ctx.currentTime + at;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.2);
    });
  } catch {
    // Sin sonido: no pasa nada.
  }
}

function notify(title: string, body: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const opts: NotificationOptions = { body, icon: "/icon-192", badge: "/icon-badge", tag: "enfoque", data: { url: "/enfoque" } };
    // En Android solo anda desde el service worker; en la compu, también directo.
    const direct = () => {
      try {
        new Notification(title, opts);
      } catch {
        // Sin aviso.
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((r) => (r ? r.showNotification(title, opts) : direct()))
        .catch(direct);
    } else direct();
  } catch {
    // Sin aviso.
  }
}

function alarm(title: string, body: string) {
  haptic("complete");
  beep();
  if (document.visibilityState !== "visible") notify(title, body);
}

/** Si el tiempo de lo que corre se acabó, lo da por terminado. */
function check() {
  const s = load();
  if (s.status !== "running" || !s.endsAt || Date.now() < s.endsAt) return;
  if (s.mode === "focus") {
    const startedAt = s.startedAt ?? s.endsAt - s.durationMs;
    set({ ...s, status: "ended", endsAt: null, remainingMs: 0, ended: { startedAt, endedAt: s.endsAt, minutes: focusedMinutes(s.durationMs), link: s.link } });
    alarm("Sesión terminada", "Anotá qué hiciste.");
  } else {
    const durationMs = modeMs("focus", s.settings);
    set({ ...s, mode: "focus", status: "idle", durationMs, endsAt: null, remainingMs: durationMs, startedAt: null });
    alarm("Se terminó el descanso", "¿Otra sesión de enfoque?");
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** Un aviso justo para cuando termina (más uno por segundo mientras corre, por si el navegador lo atrasa). */
function schedule() {
  clearTimeout(timer);
  const s = state;
  if (typeof window === "undefined" || !s || s.status !== "running" || !s.endsAt || listeners.size === 0) return;
  timer = setTimeout(() => {
    check();
    schedule();
  }, Math.min(1000, Math.max(0, s.endsAt - Date.now()) + 30));
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    state = null;
    load();
    schedule();
    fn();
  };
  const onVisible = () => check();
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisible);
  check();
  schedule();
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisible);
    if (listeners.size === 0) clearTimeout(timer);
  };
}

export function useFocusTimer(): FocusTimerState {
  return useSyncExternalStore(subscribe, load, () => SERVER);
}

/** Lo que falta, redibujado cada ~250 ms mientras corre (solo quien lo muestra se redibuja). */
export function useRemaining(s: FocusTimerState): number {
  const [tick, setTick] = useState<{ now: number; endsAt: number | null }>({ now: 0, endsAt: null });
  const { status, endsAt } = s;
  useEffect(() => {
    if (status !== "running") return;
    const run = () => setTick({ now: Date.now(), endsAt });
    const first = setTimeout(run, 0);
    const id = setInterval(run, 250);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [status, endsAt]);
  // Recién arrancado (antes del primer tick) se muestra lo que faltaba al tocar "Empezar".
  if (status === "running" && tick.endsAt !== endsAt) return s.remainingMs;
  return Math.min(s.durationMs, remainingOf(s, tick.now));
}

// ─── Acciones ─────────────────────────────────────────────────────────────

/** Toma los tiempos de la pantalla (lo guardado en el servidor). Si no hay nada corriendo, rearma el reloj. */
export function syncSettings(settings: FocusSettings) {
  const s = load();
  if (JSON.stringify(s.settings) === JSON.stringify(settings)) return;
  if (s.status === "idle") {
    const durationMs = modeMs(s.mode, settings);
    set({ ...s, settings, durationMs, remainingMs: durationMs });
  } else set({ ...s, settings });
}

export function setMode(mode: FocusMode) {
  const s = load();
  const durationMs = modeMs(mode, s.settings);
  set({ ...s, mode, status: "idle", durationMs, endsAt: null, remainingMs: durationMs, startedAt: null });
}

export function start() {
  const s = load();
  if (s.status === "running" || s.status === "ended") return;
  primeAudio();
  const now = Date.now();
  set({ ...s, status: "running", endsAt: now + s.remainingMs, startedAt: s.startedAt ?? now });
}

export function pause() {
  const s = load();
  if (s.status !== "running" || !s.endsAt) return;
  set({ ...s, status: "paused", remainingMs: Math.max(0, s.endsAt - Date.now()), endsAt: null });
}

export function toggle() {
  const s = load();
  if (s.status === "running") pause();
  else start();
}

/** Vuelve a empezar esta parte (sin anotar nada). */
export function reset() {
  const s = load();
  set({ ...s, status: "idle", endsAt: null, remainingMs: s.durationMs, startedAt: null });
}

/**
 * "Terminar" antes de tiempo. En una sesión de enfoque con al menos un minuto, queda
 * para anotar; con menos, vuelve a empezar. En un descanso, vuelve al enfoque.
 * Devuelve si quedó para anotar.
 */
export function finish(): boolean {
  const s = load();
  if (s.status === "idle" || s.status === "ended") return false;
  const now = Date.now();
  const left = remainingOf(s, now);
  if (s.mode !== "focus") {
    const durationMs = modeMs("focus", s.settings);
    set({ ...s, mode: "focus", status: "idle", durationMs, endsAt: null, remainingMs: durationMs, startedAt: null });
    return false;
  }
  const focused = s.durationMs - left;
  if (focused < MIN_SAVE_MS) {
    reset();
    return false;
  }
  const startedAt = s.startedAt ?? now - focused;
  set({ ...s, status: "ended", endsAt: null, remainingMs: 0, ended: { startedAt, endedAt: now, minutes: focusedMinutes(focused), link: s.link } });
  haptic("success");
  return true;
}

/** Elegir en qué se trabaja (o nada). */
export function setLink(link: FocusLink | null) {
  const s = load();
  set({ ...s, link: link && (link.taskId || link.blockId || link.title) ? link : null });
}

/** Desde el Plan: liga la tarea o el bloque y arranca una sesión de enfoque (si no había una corriendo). */
export function startLinked(link: FocusLink) {
  const s = load();
  setLink(link);
  if (s.status === "ended") return;
  if (s.mode !== "focus" || s.status === "idle") {
    if (s.mode !== "focus") setMode("focus");
    start();
  } else if (s.status === "paused") start();
}

/**
 * Después de anotar (o descartar) la sesión terminada: suma una al día y sigue con el
 * descanso que toca (`then = "break"`, cada `every` el largo) u otra sesión (`"focus"`).
 */
export function afterEnded(then: "break" | "focus" | "idle") {
  const s = load();
  const done = doneToday(s) + 1;
  const mode: FocusMode = then === "break" ? breakAfter(done, s.settings.every) : "focus";
  const durationMs = modeMs(mode, s.settings);
  const base: FocusTimerState = { ...s, mode, durationMs, ended: null, done, doneDay: todayISO(), startedAt: null, endsAt: null, remainingMs: durationMs, status: "idle" };
  if (then === "idle") return set(base);
  primeAudio();
  const now = Date.now();
  set({ ...base, status: "running", startedAt: now, endsAt: now + durationMs });
}

/** Descartar la sesión terminada sin anotarla (no suma). */
export function discardEnded() {
  const s = load();
  const durationMs = modeMs("focus", s.settings);
  set({ ...s, mode: "focus", status: "idle", ended: null, durationMs, endsAt: null, remainingMs: durationMs, startedAt: null });
}

/** Cuántas sesiones van hoy (para "sesión N de 4"). */
export function sessionsDone(s: FocusTimerState): number {
  return doneToday(s);
}
