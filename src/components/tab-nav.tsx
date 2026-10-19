"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Icon } from "@phosphor-icons/react";
import { cx } from "./ui";

/** Abrir en otra pestaña (Ctrl/Cmd/Shift o botón del medio) no cambia la marca. */
export function plainClick(e: React.MouseEvent) {
  return !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
}

/**
 * La dirección "que se ve elegida": la tocada (enseguida, sin esperar a que llegue
 * la pantalla) o la actual. Devuelve `[path, pick]`; `pick(href)` va en el onClick
 * de cada pestaña. Se olvida al cambiar la dirección o a los 8 s (si la navegación
 * no llegó, vuelve a la marca real).
 */
export function useTabPath(): [string, (href: string) => (e: React.MouseEvent) => void] {
  const pathname = usePathname();
  const [clicked, setClicked] = useState<string | null>(null);
  const [from, setFrom] = useState(pathname);
  if (from !== pathname) {
    setFrom(pathname);
    setClicked(null);
  }
  useEffect(() => {
    if (!clicked) return;
    const t = setTimeout(() => setClicked(null), 8000);
    return () => clearTimeout(t);
  }, [clicked]);
  const pick = (href: string) => (e: React.MouseEvent) => {
    if (plainClick(e)) setClicked(href.split("?")[0]);
  };
  return [clicked ?? pathname, pick];
}

/** Rayita de arriba de la pestaña elegida; late apenas mientras carga la pantalla tocada. */
function TabMark({ active }: { active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cx(
        "absolute top-0 h-[2px] w-8 rounded-full transition-colors duration-[var(--dur-quick)]",
        active ? "bg-accent" : "bg-transparent",
        active && pending && "nav-pending",
      )}
    />
  );
}

/**
 * Pestaña de la barra de abajo del celular (Hábitos, Plan, Gastos, Journal): ícono y
 * nombre, se tiñe al tocarla (`tap-tint`) y precarga su pantalla.
 */
export function BottomTab({
  href,
  label,
  icon: Ico,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: Icon;
  active: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <Link
      href={href}
      prefetch
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="tap-tint relative flex flex-col items-center gap-1 rounded-2xl pt-2.5 pb-2 [--tap-inset:3px_2px]"
    >
      <TabMark active={active} />
      <Ico size={22} weight={active ? "fill" : "regular"} className={cx("transition-colors duration-[var(--dur-quick)]", active ? "text-fg" : "text-muted")} />
      <span className={cx("text-[11.5px] transition-colors duration-[var(--dur-quick)]", active ? "font-semibold text-fg" : "text-muted")}>{label}</span>
    </Link>
  );
}

/** Pestaña de arriba en pantalla grande (debajo del título de cada módulo). */
export function TopTab({
  href,
  label,
  active,
  onClick,
}: {
  href: string;
  label: string;
  active: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <Link
      href={href}
      prefetch
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cx(
        "-mb-px border-b-[1.5px] pb-3 text-[14px] whitespace-nowrap transition-colors duration-[var(--dur-quick)]",
        active ? "border-fg font-medium text-fg" : "border-transparent text-muted hover:text-fg",
      )}
    >
      {label}
    </Link>
  );
}
