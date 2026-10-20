"use client";

import { safeForm } from "@/components/safe-action";
import { useActionState, useRef, useState } from "react";
import { CheckCircle, DownloadSimple, FileArrowUp, Medal, Notebook, Wallet, WarningCircle, type Icon } from "@phosphor-icons/react";
import { importBackup, type ImportResult } from "@/lib/data-actions";
import { HealthImport } from "./health-import";
import { WatchCard } from "./watch-card";
import type { WatchStatus } from "@/lib/watch";
import { formatShort } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { cx } from "@/components/ui";

type Stats = {
  habits: number;
  logs: number;
  lastLog: string | null;
  entries: number;
  lastEntry: string | null;
  txs: number;
  lastTx: string | null;
  checkins: number;
  blocks: number;
  stepDays: number;
  lastSteps: string | null;
};

const nf = new Intl.NumberFormat("es-UY");
/** "1 entrada", "1.234 entradas". */
const count = (n: number, one: string, many: string) => `${nf.format(n)} ${n === 1 ? one : many}`;

export function DataView({ stats, backups, watch }: { stats: Stats; backups: React.ReactNode; watch: WatchStatus }) {
  return (
    <>
      <PageHeader title="Datos" kicker="Backups y exportación" wide />
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 pt-2 pb-16 lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-4">
        <section className="grid gap-3 lg:col-span-12">
          <WatchCard status={watch} />
        </section>

        <section className="rise grid gap-3 lg:col-span-12">
          <h2 className="text-[15px] font-semibold">Importar un backup</h2>
          <p className="max-w-[70ch] text-[13.5px] leading-relaxed text-muted">
            Subí el archivo que exporta cada app. No se borra nada: lo nuevo se suma, lo que ya estaba no se duplica y las
            notas, ánimos y etiquetas que pusiste acá se respetan.
          </p>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <ImportCard
              kind="habitnow"
              title="HabitNow"
              icon={Medal}
              color="var(--c-habitos)"
              accept=".hn"
              how="En HabitNow: Ajustes → Backup → Exportar. Es un archivo .hn."
              status={`${nf.format(stats.habits)} hábitos, ${nf.format(stats.logs)} marcas${stats.lastLog ? `, la última del ${formatShort(stats.lastLog)}` : ""}`}
            />
            <ImportCard
              kind="mydiary"
              title="My Diary"
              icon={Notebook}
              color="var(--c-journal)"
              accept=".pdf,.docx,.txt"
              how="En My Diary: Exportar en PDF (o Word). Desde PDF solo se agregan las entradas que faltan."
              status={`${count(stats.entries, "entrada", "entradas")}${stats.lastEntry ? `, la última del ${formatShort(stats.lastEntry)}` : ""}`}
            />
            <ImportCard
              kind="gastos"
              title="App de gastos"
              icon={Wallet}
              color="var(--c-gastos)"
              accept=".csv"
              how="Exportá el CSV de la app. Las transferencias no vienen en el export: cargalas acá a mano."
              status={`${count(stats.txs, "movimiento", "movimientos")}${stats.lastTx ? `, el último del ${formatShort(stats.lastTx)}` : ""}`}
            />
            <HealthImport
              status={stats.stepDays ? `Pasos de ${count(stats.stepDays, "día", "días")}${stats.lastSteps ? `, el último del ${formatShort(stats.lastSteps)}` : ""}` : "Todavía sin datos"}
            />
          </div>
        </section>

        <section className="rise grid gap-4 rounded-[20px] border border-line bg-surface p-4 lg:col-span-12 lg:p-5" style={{ "--i": 2 } as React.CSSProperties}>
          <div className="grid gap-1">
            <h2 className="text-[15px] font-semibold">Descargar tus datos</h2>
            <p className="text-[13.5px] text-muted">
              Una copia tuya, para guardar o abrir en otro lado. Incluye {count(stats.checkins, "check-in", "check-ins")} y{" "}
              {count(stats.blocks, "bloque", "bloques")} del plan.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Download href="/api/exportar?formato=json" title="Todo (JSON comprimido)" sub="Respaldo completo, se abre con doble clic" />
            <Download href="/api/exportar?formato=gastos" title="Gastos (CSV)" sub="Para Excel o Google Sheets" />
            <Download href="/api/exportar?formato=journal" title="Journal (Markdown)" sub="Todas las entradas en un archivo" />
          </div>
        </section>
        {backups}
      </main>
    </>
  );
}

function ImportCard({
  kind,
  title,
  icon: Ico,
  color,
  accept,
  how,
  status,
}: {
  kind: string;
  title: string;
  icon: Icon;
  color: string;
  accept: string;
  how: string;
  status: string;
}) {
  const [state, action, pending] = useActionState<ImportResult, FormData>(safeForm(importBackup), null);
  const [name, setName] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  return (
    <form action={action} className="grid content-start gap-3 rounded-[20px] border border-line bg-surface p-4 lg:p-5">
      <input type="hidden" name="tipo" value={kind} />
      <header className="flex items-center gap-2.5">
        <span className="inline-flex size-9 items-center justify-center rounded-xl text-white" style={{ background: color }}>
          <Ico size={18} weight="fill" aria-hidden />
        </span>
        <span className="grid">
          <span className="text-[15px] font-semibold">{title}</span>
          <span className="text-[12px] text-muted">{status}</span>
        </span>
      </header>
      <p className="text-[13px] leading-relaxed text-muted">{how}</p>
      <label
        className={cx(
          "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3 transition-colors",
          name ? "border-fg/40 bg-surface-2" : "border-line-strong hover:bg-surface-2",
        )}
      >
        <FileArrowUp size={20} className="shrink-0 text-muted" aria-hidden />
        <span className={cx("min-w-0 truncate text-[13.5px]", !name && "text-muted")}>{name ?? "Elegir archivo"}</span>
        <input
          ref={input}
          type="file"
          name="archivo"
          accept={accept}
          required
          className="sr-only"
          onChange={(e) => setName(e.target.files?.[0]?.name ?? null)}
        />
      </label>
      <button
        type="submit"
        disabled={pending || !name}
        className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-5 text-[14px] font-medium text-on-ink transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
      >
        {pending ? "Importando…" : "Importar"}
      </button>
      {state && (
        <p
          role="status"
          className={cx(
            "reveal flex gap-2 rounded-xl p-3 text-[13px] leading-relaxed",
            state.ok ? "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" : "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]",
          )}
        >
          {state.ok ? <CheckCircle size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> : <WarningCircle size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden />}
          {state.ok ? state.message : state.error}
        </p>
      )}
    </form>
  );
}

function Download({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <a
      href={href}
      download
      className="group flex items-center gap-3 rounded-xl bg-surface-2 p-3.5 transition-colors hover:bg-surface-3"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-fg transition-transform group-hover:translate-y-0.5">
        <DownloadSimple size={17} aria-hidden />
      </span>
      <span className="grid min-w-0">
        <span className="text-[14px] font-medium">{title}</span>
        <span className="text-[12px] leading-snug text-muted">{sub}</span>
      </span>
    </a>
  );
}
