"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

export type MenuItem = { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean };

/** Menú desplegable chico (los tres puntitos). Cierra al tocar afuera o con Escape. */
export function Menu({ trigger, items, align = "right" }: { trigger: (toggle: () => void) => React.ReactNode; items: MenuItem[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <div
          role="menu"
          className={cx(
            "menu-in absolute top-full z-30 mt-1 min-w-48 overflow-hidden rounded-[6px] border border-line-strong bg-surface py-1 shadow-[0_10px_30px_-16px_rgba(var(--shadow-tint),0.35)]",
            align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left",
          )}
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={cx(
                "flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left text-[14px] transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
                it.danger ? "text-danger" : "text-fg",
              )}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
