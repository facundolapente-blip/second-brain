"use client";

import { useRef } from "react";
import { Check, CopySimple, NotePencil, PencilSimple, Trash } from "@phosphor-icons/react";
import { haptic } from "@/components/haptics";
import { leaveThen } from "@/components/motion";
import { showContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { useSafeTransition } from "@/components/safe-action";
import { SwipeRow, type SwipeAction } from "@/components/swipe-row";
import { notifyDeleted, notifyInfo } from "@/components/undo-toast";
import { deleteTransaction, duplicateTransaction, renameTransaction } from "@/lib/offline/finance";
import type { TxDTO } from "@/lib/finance-logic";
import type { TxOptimistic } from "./tx-sheet";

/**
 * Lo que se le puede hacer a un movimiento desde la lista, igual por los tres
 * caminos: clic derecho (compu), mantener apretado (celular) y deslizar la fila.
 * Borrar va a la papelera (sale con `leaveThen` y deja Deshacer); en cuotas, solo
 * esa cuota. Con `onOptimistic` la lista lo muestra al instante.
 */
let dupSeq = 0;

export function useTxActions({ edit, onOptimistic }: { edit?: (t: TxDTO) => void; onOptimistic?: (c: TxOptimistic) => void }) {
  const [, start] = useSafeTransition();

  function remove(t: TxDTO) {
    leaveThen(`[data-leave="${t.id}"]`, () =>
      start(() => {
        onOptimistic?.({ type: "remove", id: t.id });
        return deleteTransaction(t.id);
      }),
    );
    notifyDeleted(t.installment ? "Cuota borrada" : "Movimiento borrado");
  }

  function duplicate(t: TxDTO) {
    // La copia aparece enseguida debajo de su día (sin fotos ni cuotas, como en el servidor).
    const copy: TxDTO = { ...t, id: `optimista-copia-${++dupSeq}`, photos: [], installment: null };
    start(async () => {
      onOptimistic?.({ type: "save", tx: copy });
      await duplicateTransaction(t.id);
      notifyInfo("Movimiento duplicado");
    });
  }

  function rename(t: TxDTO, title: string) {
    start(() => {
      onOptimistic?.({ type: "save", tx: { ...t, title: title.trim() || null } });
      return renameTransaction(t.id, title);
    });
  }

  function items(t: TxDTO, extra?: ContextMenuItem[]): ContextMenuItem[] {
    return [
      {
        label: "Cambiar título",
        icon: <PencilSimple size={15} />,
        rename: { value: t.title ?? "", onSave: (title) => rename(t, title) },
      },
      { label: "Duplicar", icon: <CopySimple size={15} />, onSelect: () => duplicate(t) },
      ...(edit ? [{ label: "Editar", icon: <NotePencil size={15} />, onSelect: () => edit(t) }] : []),
      ...(extra ?? []),
      { label: t.installment ? "Borrar esta cuota" : "Borrar", icon: <Trash size={15} />, danger: true, onSelect: () => remove(t) },
    ];
  }

  function menu(e: React.MouseEvent, t: TxDTO, extra?: ContextMenuItem[]) {
    const name = t.title || (t.kind === "transfer" ? "Transferencia" : "Sin título");
    showContextMenu(e, items(t, extra), name);
  }

  const swipeDelete = (t: TxDTO): SwipeAction => ({
    label: t.installment ? "Borrar cuota" : "Borrar",
    icon: <Trash size={20} weight="bold" />,
    tone: "danger",
    onAction: () => remove(t),
  });
  const swipeDuplicate = (t: TxDTO): SwipeAction => ({
    label: "Duplicar",
    icon: <CopySimple size={20} weight="bold" />,
    tone: "accent",
    onAction: () => duplicate(t),
  });

  return { remove, duplicate, rename, menu, swipeDelete, swipeDuplicate };
}

export type TxActions = ReturnType<typeof useTxActions>;

/** Sugerencia de categoría para deslizar en Sin clasificar. */
export function swipeApply(name: string, onAction: () => void): SwipeAction {
  return { label: name, icon: <Check size={20} weight="bold" />, tone: "done", onAction };
}

/**
 * Mantener apretado ~450 ms en el celular abre el mismo menú que el clic derecho
 * (con un pulso al llegar). Moverse más de 10 px lo cancela (es scroll o deslizar).
 * El toque que sigue no abre la fila, y el `contextmenu` que Android manda después
 * del mismo gesto no abre el menú dos veces.
 */
export function useLongPress(onLong: (e: React.MouseEvent) => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const firedAt = useRef(0);

  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };

  return {
    onTouchStart(e: React.TouchEvent) {
      if (e.touches.length !== 1) return cancel();
      const t = e.touches[0];
      const target = e.currentTarget as HTMLElement;
      start.current = { x: t.clientX, y: t.clientY };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const s = start.current;
        if (!s) return;
        firedAt.current = Date.now();
        haptic("threshold");
        // El menú compartido espera un evento de mouse: alcanza con la posición y el elemento.
        const fake = {
          target,
          currentTarget: target,
          clientX: s.x,
          clientY: s.y,
          preventDefault() {},
          stopPropagation() {},
        } as unknown as React.MouseEvent;
        onLong(fake);
      }, ms);
    },
    onTouchMove(e: React.TouchEvent) {
      const s = start.current;
      if (!s) return;
      const t = e.touches[0];
      if (Math.abs(t.clientX - s.x) > 10 || Math.abs(t.clientY - s.y) > 10) cancel();
    },
    onTouchEnd(e: React.TouchEvent) {
      cancel();
      // Ya se abrió el menú: el dedo que se levanta no es un toque en la fila.
      if (Date.now() - firedAt.current < 1500 && firedAt.current) {
        e.preventDefault();
      }
    },
    onTouchCancel: cancel,
    /** Para el `onClick` de la fila: true si viene de mantener apretado. */
    swallow() {
      return Date.now() - firedAt.current < 800;
    },
    /** Para `onContextMenu`: el de Android que llega después del mismo gesto se ignora. */
    justFired() {
      return Date.now() - firedAt.current < 1500;
    },
  };
}

/**
 * Fila de movimiento con los gestos del celular: deslizar (izquierda borra,
 * derecha duplica o lo que se pase en `right`) y mantener apretado (menú).
 * `children` recibe las props para el botón de la fila.
 */
export function TxGestures({
  tx,
  actions,
  right,
  onMenu,
  disabled,
  children,
}: {
  tx: TxDTO;
  actions: TxActions;
  /** Acción al deslizar hacia la derecha (por defecto, Duplicar). `null` = ninguna. */
  right?: SwipeAction | null;
  /** Menú (clic derecho o mantener apretado). Por defecto, el de `actions`. */
  onMenu?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  children: (props: {
    onContextMenu: (e: React.MouseEvent) => void;
    onClickCapture: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
    onTouchCancel: () => void;
  }) => React.ReactNode;
}) {
  const openMenu = onMenu ?? ((e: React.MouseEvent) => actions.menu(e, tx));
  const press = useLongPress(openMenu);
  return (
    <SwipeRow
      disabled={disabled}
      left={right === null ? undefined : (right ?? actions.swipeDuplicate(tx))}
      right={actions.swipeDelete(tx)}
      surface="bg-surface"
    >
      {children({
        onContextMenu: (e) => {
          if (press.justFired()) {
            e.preventDefault();
            return;
          }
          openMenu(e);
        },
        onClickCapture: (e) => {
          if (press.swallow()) {
            e.preventDefault();
            e.stopPropagation();
          }
        },
        onTouchStart: press.onTouchStart,
        onTouchMove: press.onTouchMove,
        onTouchEnd: press.onTouchEnd,
        onTouchCancel: press.onTouchCancel,
      })}
    </SwipeRow>
  );
}
