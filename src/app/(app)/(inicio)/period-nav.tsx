"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import "./period.css";

/**
 * Cambiar de período (semana, mes, año, rango) sin esperar al servidor: el rótulo
 * cambia al toque (`shown`, optimista) y, si los datos tardan más de 150 ms, el
 * contenido baja a 0,55 de opacidad (`bodyProps`, ver period.css). Varios toques
 * seguidos se suman: cada uno parte del período pendiente, no del que se ve.
 * Cuando llegan los datos, `shown` vuelve a ser el de la página.
 */
export function usePeriodNav(current: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [shown, setShown] = useOptimistic(current);
  function go(next: string, href: string) {
    start(() => {
      setShown(next);
      router.push(href, { scroll: false });
    });
  }
  return {
    shown,
    pending,
    go,
    bodyProps: { "data-period-body": "", "data-period-loading": pending ? "" : undefined },
  };
}

/**
 * Flecha de período: un enlace de verdad (abre en otra pestaña con Ctrl/clic del
 * medio y precarga el período de al lado), pero el toque común va por `onGo`.
 */
export function PeriodArrow({
  href,
  onGo,
  label,
  className,
  children,
}: {
  href: string;
  onGo: () => void;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch
      scroll={false}
      aria-label={label}
      title={label}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onGo();
      }}
    >
      {children}
    </Link>
  );
}
