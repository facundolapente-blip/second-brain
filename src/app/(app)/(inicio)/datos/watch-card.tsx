"use client";

import { useActionState, useState } from "react";
import { ArrowClockwise, ArrowSquareOut, CheckCircle, CircleNotch, Watch, WarningCircle } from "@phosphor-icons/react";
import { safeForm, useSafeTransition } from "@/components/safe-action";
import { Button, ConfirmButton, cx, inputClass } from "@/components/ui";
import { TintedCard } from "@/components/tinted-card";
import { formatShort } from "@/lib/dates";
import { connectWatch, disconnectWatch, syncWatchNow, type WatchResult } from "@/lib/offline/watch";
import type { WatchStatus } from "@/lib/watch";

/** "hace 5 min", "hace 2 h", "el 12 oct". */
function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `el ${formatShort(iso.slice(0, 10))}`;
}

/**
 * Reloj Huawei por intervals.icu: los pasos, el sueño y el peso llegan solos cada hora.
 * Sin conectar, los pasos para hacerlo y el campo para pegar la clave (la clave no vuelve
 * a mostrarse: solo sus últimos 4 caracteres).
 */
export function WatchCard({ status }: { status: WatchStatus }) {
  const [state, action, connecting] = useActionState<WatchResult | null, FormData>(safeForm(connectWatch), null);
  const [result, setResult] = useState<WatchResult | null>(null);
  const [busy, start] = useSafeTransition();
  const shown = result ?? state;

  return (
    <TintedCard
      icon={Watch}
      title="Reloj Huawei"
      meta={
        status.connected
          ? status.lastError
            ? "Conectado, con un problema"
            : `Conectado · ${status.lastSync ? `última sincronización ${ago(status.lastSync)}` : "todavía sin sincronizar"}`
          : "Sin conectar"
      }
      action={status.connected ? { href: "/salud", label: "Ver en Salud" } : undefined}
      className="lg:col-span-12"
      bodyClassName="grid! content-start gap-4! lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6!"
    >
      <div className="grid content-start gap-3">
        <p className="max-w-[60ch] text-[13px] leading-relaxed text-muted">
          Tus pasos, tu sueño y tu peso del Watch Fit 3 llegan solos al check-in de cada día (se revisa cada hora). Pasan por
          intervals.icu, que es gratis y tiene la conexión oficial con Huawei Health: vos seguís usando la app de Huawei como
          siempre. El sueño y el peso que cargues a mano no se pisan.
        </p>
        {status.connected && (
          <dl className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-3">
            <div className="grid gap-0.5 rounded-xl bg-surface-2 px-3 py-2">
              <dt className="text-[11.5px] text-muted">Último día con pasos</dt>
              <dd className="font-medium">{status.lastDay ? formatShort(status.lastDay) : "–"}</dd>
            </div>
            <div className="grid gap-0.5 rounded-xl bg-surface-2 px-3 py-2">
              <dt className="text-[11.5px] text-muted">Conectado</dt>
              <dd className="font-medium">{formatShort(status.connectedAt.slice(0, 10))}</dd>
            </div>
            <div className="grid gap-0.5 rounded-xl bg-surface-2 px-3 py-2">
              <dt className="text-[11.5px] text-muted">Clave</dt>
              <dd className="font-mono font-medium">···· {status.keyHint}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="grid content-start gap-3">
        {status.connected ? (
          <>
            {status.lastError && (
              <p className="flex items-start gap-2 rounded-xl bg-[var(--st-fail-bg)] px-3 py-2.5 text-[13px] text-[var(--st-fail-fg)]">
                <WarningCircle size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
                {status.lastError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="accent"
                size="sm"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    setResult(await syncWatchNow());
                  })
                }
              >
                {busy ? <CircleNotch size={15} className="motion-safe:animate-spin" aria-hidden /> : <ArrowClockwise size={15} weight="bold" aria-hidden />}
                Sincronizar ahora
              </Button>
              <ConfirmButton
                confirmLabel="Tocá de nuevo para desconectar"
                disabled={busy}
                onConfirm={() =>
                  start(async () => {
                    setResult(await disconnectWatch());
                  })
                }
              >
                Desconectar
              </ConfirmButton>
            </div>
          </>
        ) : (
          <>
            <ol className="grid list-none gap-2 text-[13px] leading-relaxed [counter-reset:paso]">
              {[
                <>
                  Creá una cuenta gratis en{" "}
                  <a href="https://intervals.icu" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-accent-fg underline underline-offset-2">
                    intervals.icu <ArrowSquareOut size={12} aria-hidden />
                  </a>
                  .
                </>,
                <>
                  Ahí: <b className="font-medium">Settings → Connections → Huawei</b>, y entrá con tu cuenta de Huawei Health.
                </>,
                <>
                  En <b className="font-medium">Settings → Developer Settings</b>, tocá <b className="font-medium">API Key</b> y copiala.
                </>,
                <>Pegala acá abajo y tocá Conectar: trae el último año de una vez.</>,
              ].map((text, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[12px] font-medium">{i + 1}</span>
                  <span className="pt-0.5">{text}</span>
                </li>
              ))}
            </ol>
            <form action={action} className="flex flex-wrap gap-2">
              <input
                name="apiKey"
                type="password"
                autoComplete="off"
                spellCheck={false}
                required
                aria-label="Clave de intervals.icu (API Key)"
                placeholder="Pegá la clave"
                className={cx(inputClass, "min-w-0 flex-1 font-mono")}
              />
              <Button type="submit" variant="accent" disabled={connecting}>
                {connecting && <CircleNotch size={15} className="motion-safe:animate-spin" aria-hidden />}
                {connecting ? "Conectando…" : "Conectar"}
              </Button>
            </form>
          </>
        )}
        {shown && (
          <p
            role="status"
            className={cx(
              "flex items-start gap-2 text-[13px]",
              shown.ok ? "text-[var(--st-done-fg)]" : "text-[var(--st-fail-fg)]",
            )}
          >
            {shown.ok ? <CheckCircle size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> : <WarningCircle size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden />}
            {shown.ok ? shown.message : shown.error}
          </p>
        )}
      </div>
    </TintedCard>
  );
}
