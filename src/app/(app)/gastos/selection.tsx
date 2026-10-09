"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { normalizeSelection, scopeOf, SELECTION_COOKIE, type AccountDTO, type Selection } from "@/lib/finance-logic";

type Ctx = { selection: Selection; setSelection: (s: Selection) => void };

const SelectionCtx = createContext<Ctx>({ selection: null, setSelection: () => {} });

/**
 * Qué cuentas se están mirando (una, varias o todas). Se guarda en una cookie
 * para que el servidor la lea al renderizar y no haya parpadeo al recargar.
 */
export function SelectionProvider({ initial, children }: { initial: Selection; children: React.ReactNode }) {
  const [selection, setState] = useState<Selection>(initial);
  const setSelection = useCallback((s: Selection) => {
    setState(s);
    const value = s ? encodeURIComponent(s.join(",")) : "";
    document.cookie = `${SELECTION_COOKIE}=${value}; path=/; max-age=${s ? 60 * 60 * 24 * 365 : 0}; samesite=lax`;
  }, []);
  const value = useMemo(() => ({ selection, setSelection }), [selection, setSelection]);
  return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>;
}

/**
 * Selección vigente, ya limpia de cuentas que no existen. `selection` es lo
 * elegido (null = "Todas", para los botones); `scope`, las cuentas que cuentan
 * en los números: con "Todas", solo las personales (las de trabajo, si se eligen).
 */
export function useSelection(accounts: AccountDTO[]) {
  const { selection, setSelection } = useContext(SelectionCtx);
  const ids = accounts.map((a) => a.id);
  const sel = normalizeSelection(selection, ids);
  const key = sel ? sel.join(",") : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scope = useMemo(() => scopeOf(sel, accounts), [key, accounts]);
  return { selection: sel, scope, setSelection };
}
