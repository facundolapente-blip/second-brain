"use client";

import { useOnNew } from "@/components/nav-add";

/**
 * El "+" de la barra de abajo de Gastos (`NavAddButton`): cada pantalla decide qué
 * crea (Movimientos y Buscar: un movimiento; Deudas: una deuda; Metas: una meta;
 * Presupuestos: un presupuesto puntual...). Las que no crean nada propio (Informes,
 * Proyección, Sin clasificar) no lo atienden y la barra va a `/gastos?nuevo=1`.
 */
export function useGastosNew(cb: () => void) {
  useOnNew(cb);
}
