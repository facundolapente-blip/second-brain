"use client";

import { useId } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Clic y arrastrar con el mouse, salvo si empieza sobre algo marcado `data-no-drag`
 * (el texto de una nota: ahí arrastrar selecciona las letras, como en cualquier página).
 */
class MouseSensorSkippingText extends MouseSensor {
  static activators: typeof MouseSensor.activators = [
    {
      eventName: "onMouseDown",
      handler: ({ nativeEvent: event }, { onActivation }) => {
        if (event.button !== 0) return false;
        if (event.target instanceof Element && event.target.closest("[data-no-drag]")) return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

/** Clases para un texto que se puede seleccionar con el mouse dentro de algo que se arrastra (junto con `data-no-drag`). */
export const SELECTABLE_TEXT = "pointer-fine:relative pointer-fine:z-[1] pointer-fine:cursor-text pointer-fine:select-text";

/** En una lista vertical, el elemento solo se mueve hacia arriba o abajo. */
const onlyVertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** Después de soltar, el clic que dispara el navegador no tiene que abrir nada. */
function swallowNextClick() {
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener("click", stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", stop, true), 120);
}

/**
 * Lista que se ordena arrastrando: en el celular, mantener apretado (~0,3 s, así un
 * toque o el scroll siguen andando); en la compu, clic y arrastrar; con teclado,
 * espacio y flechas. `onReorder` recibe los ids en el orden nuevo.
 */
export function Sortable({
  ids,
  onReorder,
  grid,
  disabled,
  children,
}: {
  ids: string[];
  /** El orden nuevo; `moved` dice cuál se movió y a qué posición. */
  onReorder: (ids: string[], moved: { id: string; to: number }) => void;
  /** Grilla de varias columnas (si no, lista vertical). */
  grid?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(MouseSensorSkippingText, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function end({ active, over }: DragEndEvent) {
    swallowNextClick();
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to), { id: String(active.id), to });
  }
  if (disabled) return <>{children}</>;
  return (
    <DndContext
      // Id estable: sin esto los ids internos no coinciden entre servidor y navegador.
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={grid ? undefined : [onlyVertical]}
      onDragStart={() => navigator.vibrate?.(12)}
      onDragEnd={end}
    >
      <SortableContext items={ids} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** Pone los elementos de `subset` (en su orden nuevo) en los lugares que ocupaban dentro de `full`. */
export function mergeOrder(full: string[], subset: string[]): string[] {
  const inSubset = new Set(subset);
  let i = 0;
  return full.map((id) => (inSubset.has(id) ? subset[i++] : id));
}

/** Para que mantener apretado no seleccione texto ni abra el menú del celular. */
const DRAG_CLASS = "touch-manipulation select-none [-webkit-touch-callout:none]";

/** Fila o tarjeta que se arrastra entera (dentro de un `Sortable`). */
export function SortableItem({
  id,
  as = "li",
  className,
  draggingClass = "rounded-xl bg-surface shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)]",
  disabled,
  onContextMenu,
  role,
  children,
}: {
  id: string;
  /** Rol de accesibilidad de la fila (por ejemplo "row" dentro de una tabla hecha con div). */
  role?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  as?: "li" | "tr" | "div" | "article";
  className?: string;
  /** Cómo se ve mientras se arrastra (levantado). */
  draggingClass?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  // Sin role="button": la fila ya tiene sus propios botones adentro.
  const { role: _role, ...attrs } = attributes;
  void _role;
  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        position: isDragging ? "relative" : undefined,
        zIndex: isDragging ? 30 : undefined,
      }}
      className={[className, disabled ? "" : DRAG_CLASS, isDragging ? draggingClass : ""].filter(Boolean).join(" ")}
      {...(disabled ? {} : { ...attrs, ...listeners })}
      role={role}
      onContextMenu={onContextMenu}
    >
      {children}
    </Tag>
  );
}
