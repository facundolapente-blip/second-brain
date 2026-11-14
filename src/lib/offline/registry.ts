"use client";

/**
 * Carga todos los envoltorios para que la cola sepa a qué acción mandar cada
 * pendiente (aunque la pantalla que lo guardó no esté abierta).
 */
import "./plan";
import "./finance";
import "./habit";
import "./journal";
import "./checkin";
import "./values";
import "./notes";
import "./wheel";
import "./memento";

export { flushActions, pendingActions, subscribePending } from "./queue";
