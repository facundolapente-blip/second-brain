"use client";

import { useState } from "react";
import { ArrowClockwise, CalendarDots, CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { useSafeTransition } from "@/components/safe-action";
import { Button, ConfirmButton } from "@/components/ui";
import { TintedCard } from "@/components/tinted-card";
import { formatShort } from "@/lib/dates";
import { disconnectGcal, syncGcalNow, type GcalResult } from "@/lib/offline/gcal";
import type { GcalStatus } from "@/lib/gcal";

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
 * Google Calendar: los eventos entran solos al Plan como bloques comunes (al abrir el
 * Plan o Inicio y cada hora). Lo creado en la app no va a Google; si a un bloque que
 * vino de Google se le cambia el día o la hora, el evento se mueve igual.
 */
const NOTICES: Record<string, string> = {
  ok: "Google Calendar quedó conectado.",
  cancelado: "No se conectó: cancelaste el permiso en Google.",
  error: "No se pudo conectar con Google. Probá de nuevo.",
  "sin-cliente": "Falta el cliente de Google (se carga en Vercel).",
};

export function GcalCard({ status, google }: { status: GcalStatus; google?: string }) {
  const notice = google ? NOTICES[google] : undefined;
  const [result, setResult] = useState<GcalResult | null>(null);
  const [busy, start] = useSafeTransition();
  return (
    <TintedCard
      tone="plan"
      icon={CalendarDots}
      title="Google Calendar"
      meta={
        !status.connected
          ? "Sin conectar"
          : status.lastError
            ? "Conectado, con un problema"
            : `Conectado · ${status.lastSync ? `última sincronización ${ago(status.lastSync)}` : "todavía sin sincronizar"}`
      }
      action={status.connected ? { href: "/plan", label: "Ver el Plan" } : undefined}
      className="lg:col-span-12"
      bodyClassName="grid! content-start gap-3!"
    >
      <p className="max-w-[68ch] text-[13px] leading-relaxed text-muted">
        Los eventos de tu calendario (una semana para atrás y cuatro meses para adelante) entran al Plan semanal como bloques comunes. Lo que
        creás en la app no va a Google. Si a un bloque que vino de Google le cambiás el día o la hora, el evento también se mueve en Google. Si lo
        borrás en el Plan, en Google queda y no vuelve a aparecer.
      </p>
      {notice && <p className="text-[13px] text-muted">{notice}</p>}
      {!status.configured ? (
        <p className="text-[13px] leading-relaxed text-muted">Falta el cliente de Google (se carga en Vercel).</p>
      ) : !status.connected ? (
        // Un enlace común (no fetch): la pantalla de permiso de Google es otra página.
        <a
          href="/api/google/conectar"
          className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-full bg-ink px-4 text-[13.5px] font-medium text-on-ink hover:opacity-90"
        >
          <CalendarDots size={16} aria-hidden />
          Conectar Google Calendar
        </a>
      ) : (
        <>
          {status.lastError && (
            <p className="flex items-start gap-2 rounded-xl bg-[var(--st-fail-bg)] px-3 py-2.5 text-[13px] text-[var(--st-fail-fg)]">
              <WarningCircle size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
              {status.lastError}
            </p>
          )}
          {result && (
            <p
              className={
                result.ok
                  ? "flex items-center gap-2 text-[13px] text-[var(--st-done-fg)]"
                  : "flex items-center gap-2 text-[13px] text-[var(--st-fail-fg)]"
              }
            >
              {result.ok ? <CheckCircle size={16} weight="fill" aria-hidden /> : <WarningCircle size={16} weight="fill" aria-hidden />}
              {result.ok ? result.message : result.error}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={busy}
            onClick={() => start(async () => setResult(await syncGcalNow()))}
          >
            {busy ? <CircleNotch size={16} className="animate-spin" aria-hidden /> : <ArrowClockwise size={16} aria-hidden />}
            Sincronizar ahora
          </Button>
          {status.created > 0 && <p className="text-[12px] text-muted">Eventos traídos hasta ahora: {status.created}</p>}
          <ConfirmButton
            className="justify-self-start"
            confirmLabel="Tocá de nuevo para desconectar"
            onConfirm={() => start(async () => setResult(await disconnectGcal()))}
          >
            Desconectar
          </ConfirmButton>
        </>
      )}
    </TintedCard>
  );
}
