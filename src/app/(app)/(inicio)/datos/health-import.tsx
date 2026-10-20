"use client";

import { useSafeTransition } from "@/components/safe-action";
import { useRef, useState } from "react";
import { CheckCircle, FileArrowUp, Footprints, WarningCircle } from "@phosphor-icons/react";
import { importHealth, type HealthImportResult } from "@/lib/offline/checkin";
import { parseHealthFile, type HealthParse } from "@/lib/health-parse";
import { formatShort } from "@/lib/dates";
import { cx } from "@/components/ui";
import { TintedCard } from "@/components/tinted-card";

const nf = new Intl.NumberFormat("es-UY");

/** Pasos y sueño desde Google Fit, Samsung Health o un CSV. El archivo se lee acá, en el celular. */
export function HealthImport({ status }: { status: string }) {
  const [parsed, setParsed] = useState<(HealthParse & { name: string }) | null>(null);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<HealthImportResult | null>(null);
  const [pending, start] = useSafeTransition();
  const input = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    setResult(null);
    setParsed(null);
    if (!file) return;
    setReading(true);
    try {
      const p = await parseHealthFile(file);
      setParsed({ ...p, name: file.name });
      if (!p.days.length) setResult({ ok: false, error: "No encontré pasos ni sueño en ese archivo." });
    } catch {
      setResult({ ok: false, error: "No se pudo leer el archivo." });
    } finally {
      setReading(false);
    }
  }

  const steps = parsed?.days.filter((d) => d.steps).length ?? 0;
  const sleep = parsed?.days.filter((d) => d.sleepMin).length ?? 0;

  return (
    <TintedCard as="div" tone="inicio" icon={Footprints} title="Pasos y sueño" meta={status} bodyClassName="gap-3!">
      <p className="text-[13px] leading-relaxed text-muted">
        Google Fit: exportalo desde Google Takeout (solo &quot;Fit&quot;) y subí el .zip. Samsung Health: Configuración → Descargar datos
        personales, y subí el .zip o los .csv. También sirve un CSV con columnas fecha y pasos. Los pasos se cruzan con tu ánimo y tus
        hábitos en Análisis; el sueño solo completa los días que no cargaste a mano.
      </p>
      <label
        className={cx(
          "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3 transition-colors",
          parsed ? "border-fg/40 bg-surface-2" : "border-line-strong hover:bg-surface-2",
        )}
      >
        <FileArrowUp size={20} className="shrink-0 text-muted" aria-hidden />
        <span className={cx("min-w-0 truncate text-[13.5px]", !parsed && "text-muted")}>
          {reading ? "Leyendo…" : (parsed?.name ?? "Elegir archivo (.zip, .csv)")}
        </span>
        <input ref={input} type="file" accept=".zip,.csv,.json" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      {parsed && parsed.days.length > 0 && (
        <p className="reveal text-[13px] text-muted">
          {parsed.source}: {nf.format(parsed.days.length)} {parsed.days.length === 1 ? "día" : "días"}, del {formatShort(parsed.days[0].date)} {parsed.days[0].date.slice(0, 4)} al{" "}
          {formatShort(parsed.days.at(-1)!.date)} {parsed.days.at(-1)!.date.slice(0, 4)} · pasos en {nf.format(steps)}, sueño en {nf.format(sleep)}.
        </p>
      )}
      <button
        type="button"
        disabled={pending || reading || !parsed?.days.length}
        onClick={() =>
          start(async () => {
            const r = await importHealth(parsed!.days);
            setResult(r);
            if (r.ok) {
              setParsed(null);
              if (input.current) input.current.value = "";
            }
          })
        }
        className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-5 text-[14px] font-medium text-on-ink transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
      >
        {pending ? "Importando…" : "Importar"}
      </button>
      {result && (
        <p
          role="status"
          className={cx(
            "flex gap-2 rounded-xl p-3 text-[13px] leading-relaxed",
            result.ok ? "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" : "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]",
          )}
        >
          {result.ok ? <CheckCircle size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> : <WarningCircle size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden />}
          {result.ok ? result.message : result.error}
        </p>
      )}
    </TintedCard>
  );
}
