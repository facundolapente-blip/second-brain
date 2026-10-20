"use client";

// Conectar y sincronizar el reloj necesitan el servidor (y a intervals.icu): pasan tal cual, sin cola.
export { connectWatch, disconnectWatch, syncWatchNow } from "../watch-actions";
export type { WatchResult } from "../watch-actions";
