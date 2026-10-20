"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ClockCountdown, Note } from "@phosphor-icons/react";
import { NavAddButton } from "@/components/nav-add";
import { BottomTab, plainClick } from "@/components/tab-nav";

export const LATER_HREF = "/notas?seccion=videos&ver=despues";

/**
 * Barra de abajo del celular: todas las notas, el "+" al medio (la pantalla
 * abre la hoja con `useOnNew`) y los videos para ver después.
 */
export function NotasNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const later = params.get("seccion") === "videos" && params.get("ver") === "despues";
  // La marca pasa enseguida a la pestaña tocada (las dos son /notas: se distinguen por la búsqueda).
  const [clicked, setClicked] = useState<"all" | "later" | null>(null);
  const [from, setFrom] = useState(search);
  if (from !== search) {
    setFrom(search);
    setClicked(null);
  }
  if (pathname !== "/notas") return null;
  const shown = clicked ?? (later ? "later" : "all");
  return (
    <nav aria-label="Notas" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-3 items-start">
        <BottomTab href="/notas" label="Notas" icon={Note} active={shown === "all"} onClick={(e) => plainClick(e) && setClicked("all")} />
        <NavAddButton label="Nueva nota" />
        <BottomTab href={LATER_HREF} label="Ver después" icon={ClockCountdown} active={shown === "later"} onClick={(e) => plainClick(e) && setClicked("later")} />
      </div>
    </nav>
  );
}
