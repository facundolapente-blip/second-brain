"use client";

import { safeForm } from "@/components/safe-action";
import { useActionState } from "react";
import { ArrowsClockwise, CheckCircle, ClockCounterClockwise, DownloadSimple, WarningCircle } from "@phosphor-icons/react";
import { backupNow, type BackupResult } from "@/lib/backup-actions";
import type { BackupInfo, BackupStatus } from "@/lib/backup";
import { cx } from "@/components/ui";
import { TintedCard } from "@/components/tinted-card";

const when = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function kb(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Respaldo automático diario: los guardados, el último estado, "hacer uno ahora" y bajar una copia. */
export function Backups({ enabled, backups, status }: { enabled: boolean; backups: BackupInfo[]; status: BackupStatus }) {
  const [state, action, pending] = useActionState<BackupResult>(safeForm(backupNow), null);
  const failed = status && !status.ok;

  return (
    <TintedCard
      icon={ClockCounterClockwise}
      title="Respaldo automático"
      meta={
        !enabled
          ? "Solo en la versión publicada"
          : backups.length
            ? `${backups.length} ${backups.length === 1 ? "copia" : "copias"} · todos los días a las 6`
            : "Todos los días a las 6"
      }
      className="lg:col-span-12"
      action={
        enabled ? (
          <form action={action}>
            <button type="submit" disabled={pending} className="tcard-pill press disabled:opacity-50">
              <ArrowsClockwise size={14} className={cx(pending && "animate-spin")} aria-hidden />
              {pending ? (
                "Guardando…"
              ) : (
                <>
                  <span className="max-sm:hidden">Hacer uno ahora</span>
                  <span className="sm:hidden">Ahora</span>
                </>
              )}
            </button>
          </form>
        ) : undefined
      }
    >
      <p className="text-[13.5px] text-muted">
        Todos los días a las 6 de la mañana se guarda una copia completa en un almacén privado, aparte de la base. Quedan las de
        los últimos 30 días y una por mes durante un año. Para tener otra copia fuera de la nube, bajala a la compu cada tanto:
        tocá cualquiera de la lista o &quot;Todo (JSON comprimido)&quot; en Exportar.
      </p>

      {(state || failed) && (
        <p
          role="status"
          className={cx(
            "reveal flex gap-2 rounded-xl p-3 text-[13px] leading-relaxed",
            state?.ok ? "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" : "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]",
          )}
        >
          {state?.ok ? <CheckCircle size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> : <WarningCircle size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden />}
          {state ? (state.ok ? state.message : state.error) : `El último respaldo falló (${when.format(new Date(status!.at))}): ${status!.error ?? "error desconocido"}.`}
        </p>
      )}

      {!enabled ? (
        <p className="rounded-xl bg-surface-2 p-3 text-[13px] text-muted">Los respaldos automáticos solo corren en la versión publicada.</p>
      ) : backups.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-3 text-[13px] text-muted">Todavía no hay respaldos guardados. El primero sale mañana a las 6, o hacelo ahora.</p>
      ) : (
        <ul className="grid divide-y divide-line overflow-hidden rounded-xl border border-line">
          {backups.map((b) => (
            <li key={b.pathname}>
              <a
                href={`/api/respaldo?archivo=${encodeURIComponent(b.pathname)}`}
                download
                className="group flex min-h-12 items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate text-[14px] first-letter:uppercase">{when.format(new Date(b.at))}</span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] text-muted group-hover:bg-surface-3">
                  {b.auto ? "Automático" : "A mano"}
                </span>
                <span className="w-16 text-right font-mono text-[12px] text-muted tabular">{kb(b.size)}</span>
                <DownloadSimple size={16} className="shrink-0 text-muted group-hover:text-fg" aria-label="Descargar" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </TintedCard>
  );
}
