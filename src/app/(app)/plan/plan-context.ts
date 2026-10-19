"use client";

import { createContext, useContext } from "react";
import type { BlockDraft } from "./block-sheet";

/**
 * Lo que la semana le presta a las tareas de arriba (que viven en la misma
 * página): abrir la hoja de bloque de la semana ("Agendar en la semana"), así el
 * bloque nuevo se ve al instante en la semana en vez de esperar al servidor.
 */
export const PlanWeekContext = createContext<{ openBlock: (draft: BlockDraft) => void } | null>(null);

export const usePlanWeek = () => useContext(PlanWeekContext);
