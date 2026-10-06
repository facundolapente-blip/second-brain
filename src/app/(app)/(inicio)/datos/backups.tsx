"use client";

import { useActionState } from "react";
import { ArrowsClockwise, CheckCircle, ClockCounterClockwise, DownloadSimple, WarningCircle } from "@phosphor-icons/react";
import { backupNow, type BackupResult } from "@/lib/backup-actions";
import type { BackupInfo, BackupStatus } from "@/lib/backup";
import { cx } from "@/components/ui";

const when = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function kb(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Respaldo automático de los lunes: los guardados, el último estado y "hacer uno ahora". */
export function Backups({ enabled, backups, status }: { enabled: boolean; backups: BackupInfo[]; status: BackupStatus }) {
  const [state, action, pending] = useActionState<BackupResult>(backupNow, null);
  const failed = status && !status.ok;

  return (
    <section className="rise grid gap-4 rounded-[20px] border border-line bg-surface p-4 lg:col-span-12 lg:p-5" style={{ "--i": 3 } as React.CSSProperties}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <ClockCounterClockwise size={18} aria-hidden />
            Respaldo automático
          </h2>
          <p className="text-[13.5px] text-muted">
            Todos los lunes a las 6 de la mañana se guarda una copia completa en un almacén privado, aparte de la base. Quedan las
            últimas 12.
          </p>
        </div>
        {enabled && (
          <form action={action}>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-on-ink transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              <ArrowsClockwise size={16} className={cx(pending && "animate-spin")} aria-hidden />
              {pending ? "Guardando…" : "Hacer uno ahora"}
            </button>
          </form>
        )}
      </div>

      {(state || failed) && (
        <p
          role="status"
          className={cx(
            "flex gap-2 rounded-xl p-3 text-[13px] leading-relaxed",
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
        <p className="rounded-xl bg-surface-2 p-3 text-[13px] text-muted">Todavía no hay respaldos guardados. El primero sale el próximo lunes, o hacelo ahora.</p>
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
    </section>
  );
}
