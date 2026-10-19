"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { haptic } from "./haptics";
import { blocksSwipe, EDGE_PX } from "./swipe";
import { cx } from "./ui";

export type SwipeAction = {
  label: string;
  icon: ReactNode;
  tone: "done" | "danger" | "accent" | "neutral";
  onAction: () => void;
};

/**
 * Fila que se desliza con el dedo para hacer una acción (como en Mail de iOS).
 * `left` aparece detrás al deslizar hacia la derecha; `right`, al deslizar hacia la izquierda.
 *
 * - La fila sigue al dedo; pasado el umbral (80 px, o el 35 % del ancho si la fila es
 *   angosta) se resiste, el ícono se agranda un poco y vibra (`threshold`).
 * - Al soltar pasado el umbral vuelve con resorte y corre `onAction`; si no, solo vuelve.
 * - Solo táctil y en celular (`hover: none`): en la compu la fila queda tal cual.
 * - Respeta `[data-no-swipe]`, los campos y el scroll vertical (`touch-action: pan-y`).
 *   Si la dirección no tiene acción, no toma el gesto (así un deslizar de día de la lista
 *   de afuera sigue andando).
 * - Con movimiento reducido no se corre: el fondo aparece con un fundido y se hace la acción.
 *
 * La acción tiene que existir también por otro lado (un menú, la hoja): deslizar es un atajo.
 */
export function SwipeRow({
  children,
  left,
  right,
  disabled,
  className,
  surface,
}: {
  children: ReactNode;
  left?: SwipeAction;
  right?: SwipeAction;
  disabled?: boolean;
  className?: string;
  /** Fondo opaco de la fila mientras se desliza (p. ej. "bg-surface"), si la fila no tiene uno. */
  surface?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const fg = useRef<HTMLDivElement>(null);
  const bgL = useRef<HTMLDivElement>(null);
  const bgR = useRef<HTMLDivElement>(null);
  const acts = useRef({ left, right, disabled });
  useEffect(() => {
    acts.current = { left, right, disabled };
  });
  const g = useRef<{
    x: number;
    y: number;
    on: boolean;
    dead: boolean;
    dx: number;
    past: boolean;
    th: number;
    reduce: boolean;
  } | null>(null);
  const swallowClick = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);

  function paint(dx: number, past: boolean, reduce: boolean, th: number) {
    const f = fg.current;
    if (!f) return;
    f.style.transition = "none";
    f.style.transform = reduce || dx === 0 ? "" : `translate3d(${dx}px,0,0)`;
    const w = box.current?.offsetWidth ?? 0;
    const show = (el: HTMLDivElement | null, on: boolean) => {
      if (!el) return;
      el.style.transition = reduce ? "opacity 120ms ease-out" : "none";
      // Solo se ve la franja que la fila deja al descubierto (si la fila es transparente,
      // el color no se ve a través de ella). Con movimiento reducido, el fondo entero.
      el.style.clipPath = reduce || !on ? "" : dx > 0 ? `inset(0 ${Math.max(0, w - dx)}px 0 0)` : `inset(0 0 0 ${Math.max(0, w + dx)}px)`;
      el.style.opacity = on ? String(reduce ? (past ? 1 : 0) : Math.min(1, Math.abs(dx) / (th * 0.6))) : "0";
      el.dataset.past = past ? "true" : "false";
    };
    show(bgL.current, dx > 0);
    show(bgR.current, dx < 0);
  }

  function release(run?: () => void, reduce?: boolean) {
    const f = fg.current;
    if (f) {
      f.style.transition = reduce ? "none" : "transform 420ms var(--ease-spring)";
      f.style.transform = "";
    }
    for (const el of [bgL.current, bgR.current]) {
      if (!el) continue;
      el.style.transition = "opacity 120ms ease-out";
      el.style.opacity = "0";
      el.dataset.past = "false";
    }
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      if (f) f.style.transition = "";
      for (const el of [bgL.current, bgR.current]) if (el) el.style.clipPath = "";
    }, 440);
    run?.();
  }

  const onTouchStart = (e: React.TouchEvent) => {
    g.current = null;
    const a = acts.current;
    if (a.disabled || (!a.left && !a.right) || e.touches.length !== 1) return;
    if (!window.matchMedia("(hover: none)").matches) return;
    const t = e.touches[0];
    if (t.clientX < EDGE_PX || t.clientX > window.innerWidth - EDGE_PX) return;
    if (blocksSwipe(e.target, box.current)) return;
    const w = box.current?.offsetWidth ?? 300;
    g.current = {
      x: t.clientX,
      y: t.clientY,
      on: false,
      dead: false,
      dx: 0,
      past: false,
      th: Math.min(80, Math.max(48, w * 0.35)),
      reduce: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const s = g.current;
    if (!s || s.dead) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
        s.dead = true; // es scroll vertical
        return;
      }
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      const a = acts.current;
      // Hacia un lado sin acción no se toma el gesto (puede ser el deslizar de afuera).
      if ((dx > 0 && !a.left) || (dx < 0 && !a.right)) {
        s.dead = true;
        return;
      }
      s.on = true;
      s.x = t.clientX - Math.sign(dx) * 10; // sin salto al arrancar
    }
    e.stopPropagation();
    const raw = t.clientX - s.x;
    const a = acts.current;
    const allowed = (raw > 0 && a.left) || (raw < 0 && a.right);
    const mag = Math.abs(raw);
    // Pasado el umbral cede cada vez menos; hacia un lado sin acción casi no se mueve.
    const shown = !allowed ? Math.min(10, Math.sqrt(mag) * 1.2) : mag <= s.th ? mag : s.th + Math.sqrt(mag - s.th) * 5;
    s.dx = Math.sign(raw) * shown;
    const past = !!allowed && mag >= s.th;
    if (past !== s.past) {
      s.past = past;
      if (past) haptic("threshold");
    }
    paint(s.dx, past, s.reduce, s.th);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const s = g.current;
    g.current = null;
    if (!s?.on) return;
    e.stopPropagation();
    swallowClick.current = true;
    setTimeout(() => (swallowClick.current = false), 350);
    const a = acts.current;
    const act = s.past ? (s.dx > 0 ? a.left : a.right) : undefined;
    release(act ? () => act.onAction() : undefined, s.reduce);
  };

  const onTouchCancel = () => {
    const s = g.current;
    g.current = null;
    if (s?.on) release(undefined, s.reduce);
  };

  return (
    <div
      ref={box}
      className={cx("relative isolate overflow-hidden", (left || right) && !disabled && "touch-pan-y", className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      onClickCapture={(e) => {
        // Un deslizar no es un toque: que no abra la fila.
        if (swallowClick.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {left && <SwipeBack ref={bgL} action={left} side="left" />}
      {right && <SwipeBack ref={bgR} action={right} side="right" />}
      <div ref={fg} className={cx("relative z-[1]", surface)}>
        {children}
      </div>
    </div>
  );
}

function SwipeBack({ action, side, ref }: { action: SwipeAction; side: "left" | "right"; ref: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      aria-hidden
      data-tone={action.tone}
      data-past="false"
      className={cx("swipe-back absolute inset-0 flex items-center gap-2 px-5 opacity-0", side === "left" ? "justify-start" : "flex-row-reverse justify-start")}
    >
      <span className="swipe-icon inline-flex">{action.icon}</span>
      <span className="text-[13px] font-semibold">{action.label}</span>
    </div>
  );
}
