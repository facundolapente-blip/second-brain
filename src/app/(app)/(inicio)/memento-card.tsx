"use client";

import { useRef, useState } from "react";
import { Hourglass } from "@phosphor-icons/react";
import { TintedCard } from "@/components/tinted-card";
import { Button, cx, Input, Sheet, type SheetHandle } from "@/components/ui";
import { quiet } from "@/components/safe-action";
import { notifyError } from "@/components/undo-toast";
import { formatLong } from "@/lib/dates";
import { MEMENTO_DEFAULT_YEARS, mementoStats, type MementoConfig } from "@/lib/memento";
import { saveMemento } from "@/lib/offline/memento";

const nf = new Intl.NumberFormat("es-UY");

/**
 * Memento mori en Inicio, debajo del saludo y al lado de la Nota del día (pedido de Facu,
 * 2026-11-14; eligió juntar los diseños A y B): semanas vividas con barra y, debajo, un
 * cuadrito por año hasta la edad elegida (el de este año, marcado). "Editar" cambia la
 * fecha de nacimiento y la edad (`AppSetting "memento"`).
 */
export function MementoCard({ config, today, className }: { config: MementoConfig | null; today: string; className?: string }) {
  const sheet = useRef<SheetHandle>(null);
  // Lo guardado se ve al toque (sin esperar al servidor).
  const [local, setLocal] = useState(config);
  const [prev, setPrev] = useState(config);
  if (prev !== config) {
    setPrev(config);
    setLocal(config);
  }
  const s = local ? mementoStats(local, today) : null;
  const edit = (
    <button type="button" onClick={() => sheet.current?.open()} className="tcard-pill press">
      {local ? "Editar" : "Configurar"}
    </button>
  );
  return (
    <>
      <TintedCard
        tone="inicio"
        icon={Hourglass}
        title="Memento mori"
        meta={s ? `semana ${nf.format(s.lived)} de ${nf.format(s.total)}` : undefined}
        action={edit}
        className={className}
        bodyClassName="gap-3!"
      >
        {s && local ? (
          <>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-[28px] leading-none font-semibold tracking-[-0.02em] tabular">{nf.format(s.lived)}</span>
                <span className="text-[13.5px] text-muted">semanas vividas</span>
                <span className="ml-auto font-mono text-[13px] tabular">{Math.round(s.share * 100)} %</span>
              </div>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.share * 100)} aria-label="Semanas vividas">
                <div className="h-full rounded-full bg-[var(--mod)]" style={{ width: `${s.share * 100}%` }} />
              </div>
              <p className="mt-2 text-[12.5px] text-muted">
                Te quedan {nf.format(s.left)} semanas si llegás a los {local.years}. Esta semana es una de ellas.
              </p>
            </div>
            <div>
              {/* Un cuadrito por año: los vividos llenos, este año con borde. */}
              <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-[3px]" role="img" aria-label={`${s.age} de ${local.years} años`}>
                {Array.from({ length: local.years }, (_, i) => (
                  <span
                    key={i}
                    className={cx(
                      "aspect-square rounded-[3px]",
                      i < s.age ? "bg-[var(--mod)]" : i === s.age ? "bg-surface ring-2 ring-[var(--mod)] ring-inset" : "bg-surface-2",
                    )}
                  />
                ))}
              </div>
              <p className="mt-2 font-mono text-[11.5px] text-muted tabular">
                Año {s.age + 1} de {local.years} · semana {s.weekOfYear} de este año
              </p>
            </div>
          </>
        ) : (
          <p className="text-[13.5px] text-muted">Poné tu fecha de nacimiento para ver cuántas semanas viviste y cuántas te quedan.</p>
        )}
      </TintedCard>
      <Sheet ref={sheet} title="Memento mori">
        <MementoForm
          config={local}
          today={today}
          onSaved={(c) => {
            setLocal(c);
            sheet.current?.close();
          }}
        />
      </Sheet>
    </>
  );
}

function MementoForm({ config, today, onSaved }: { config: MementoConfig | null; today: string; onSaved: (c: MementoConfig) => void }) {
  const [birth, setBirth] = useState(config?.birth ?? "");
  const [years, setYears] = useState(String(config?.years ?? MEMENTO_DEFAULT_YEARS));
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const y = Number(years);
        if (!birth || birth > today) return setError("Elegí tu fecha de nacimiento.");
        if (!(y >= 30 && y <= 120)) return setError("La edad tiene que estar entre 30 y 120.");
        const c = { birth, years: Math.round(y) };
        onSaved(c);
        quiet(
          saveMemento(c.birth, c.years).then((r) => {
            if (!r.ok) notifyError(r.error);
          }),
        );
      }}
    >
      <label className="grid gap-1.5 text-[13px] font-medium">
        Fecha de nacimiento
        <Input type="date" value={birth} max={today} onChange={(e) => (setError(null), setBirth(e.target.value))} required />
        {birth && <span className="text-[12px] font-normal text-muted">{formatLong(birth, today)}</span>}
      </label>
      <label className="grid gap-1.5 text-[13px] font-medium">
        Contar hasta los
        <div className="flex items-center gap-2">
          <Input type="number" inputMode="numeric" min={30} max={120} value={years} onChange={(e) => (setError(null), setYears(e.target.value))} className="max-w-24" />
          <span className="text-[13px] font-normal text-muted">años</span>
        </div>
      </label>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <Button type="submit" variant="accent">
        Guardar
      </Button>
    </form>
  );
}
