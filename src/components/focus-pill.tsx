"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle, Pause, Play } from "@phosphor-icons/react";
import { clockText, MODE_LABEL } from "@/lib/focus-logic";
import { toggle, useFocusTimer, useRemaining } from "@/lib/focus-timer";
import { haptic } from "./haptics";
import { cx } from "./ui";

/**
 * Píldora chica del temporizador de Enfoque, en toda la app menos en /enfoque: lo que
 * falta, en qué se trabaja y pausar/seguir. Al terminar una sesión dice "Terminó ·
 * anotá qué hiciste" y lleva a /enfoque, que abre la hoja. En el celular va encima de
 * la barra de abajo de los módulos; en la compu, abajo a la derecha.
 */
export function FocusPill() {
  const t = useFocusTimer();
  const left = useRemaining(t);
  const pathname = usePathname();
  if (t.status === "idle" || pathname === "/enfoque" || pathname.startsWith("/login")) return null;
  const ended = t.status === "ended";
  const running = t.status === "running";
  const label = t.mode === "focus" ? (t.link?.title ?? "Enfoque") : MODE_LABEL[t.mode];
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[35] flex justify-center px-4 lg:inset-x-auto lg:right-6 lg:bottom-6 print:hidden">
      <div className="pointer-events-auto flex max-w-full items-center gap-0.5 rounded-full bg-[var(--quote-bg)] p-1 text-[var(--quote-fg)] shadow-[0_6px_20px_rgba(0,0,0,0.22)]">
        <Link
          href="/enfoque"
          aria-label={ended ? "Terminó la sesión: anotá qué hiciste" : `${MODE_LABEL[t.mode]}: faltan ${clockText(left)}. Abrir Enfoque`}
          className="press flex min-h-10 min-w-0 items-center gap-2 rounded-full pr-2 pl-3"
        >
          {ended ? (
            <>
              <CheckCircle size={18} weight="fill" className="shrink-0 text-[var(--c-habitos)]" aria-hidden />
              <span className="truncate text-[14px] font-medium">Terminó · anotá qué hiciste</span>
            </>
          ) : (
            <>
              <span aria-hidden className={cx("size-2 shrink-0 rounded-full", running ? "bg-[var(--c-habitos)]" : "bg-[var(--quote-sub)]")} />
              <span className="font-mono text-[15px] font-semibold tabular-nums">{clockText(left)}</span>
              <span className="max-w-[8.5rem] truncate text-[13px] text-[var(--quote-sub)] sm:max-w-[14rem]">{label}</span>
            </>
          )}
        </Link>
        {!ended && (
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              toggle();
            }}
            aria-label={running ? "Pausar" : "Seguir"}
            title={running ? "Pausar" : "Seguir"}
            className="press grid size-10 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"
          >
            {running ? <Pause size={16} weight="fill" aria-hidden /> : <Play size={16} weight="fill" aria-hidden />}
          </button>
        )}
      </div>
    </div>
  );
}
