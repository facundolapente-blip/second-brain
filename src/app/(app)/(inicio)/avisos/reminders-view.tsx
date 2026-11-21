"use client";

import { useEffect, useState } from "react";
import { Bell, BellSlash, CheckCircle, DeviceMobile, PaperPlaneTilt, WarningCircle } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { TintedCard } from "@/components/tinted-card";
import { Button, cx } from "@/components/ui";
import { ReminderGroups, type HabitChoice } from "./reminder-rows";
import { CustomReminders } from "./custom-reminders";
import { actionErrorText, useSafeTransition } from "@/components/safe-action";
import { removePushSubscription, savePushSubscription, saveReminderPrefs, sendTestPush } from "@/lib/offline/push";
import { type PushPayload, type ReminderKind, type ReminderPrefs } from "@/lib/reminder-logic";

export type Device = { id: string; endpoint: string; label: string; createdAt: string; lastUsedAt: string | null };

type Support = "checking" | "ok" | "unsupported" | "ios-install" | "no-sw";
type Note = { ok: boolean; text: string } | null;

const when = new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const day = new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", day: "numeric", month: "short", year: "numeric" });

/** La clave pública VAPID (base64url) como bytes, para `pushManager.subscribe`. */
function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/**
 * Avisos al celular (Herramientas): activar en este aparato (permiso + suscripción Web Push),
 * los aparatos que los reciben, qué avisos van y a qué hora, y un aviso de prueba.
 */
export function RemindersView({
  prefs: initialPrefs,
  preview,
  habitPreview,
  habits,
  devices,
  today,
  tableReady,
  publicKey,
}: {
  today: string;
  prefs: ReminderPrefs;
  preview: Record<ReminderKind, PushPayload | null>;
  habitPreview: Record<string, PushPayload | null>;
  habits: HabitChoice[];
  devices: Device[];
  tableReady: boolean;
  publicKey: string | null;
}) {
  const [support, setSupport] = useState<Support>("checking");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState<"activar" | "desactivar" | "prueba" | null>(null);
  // Prueba de un aparato de la lista: cuál se está mandando y lo que contestó.
  const [testing, setTesting] = useState<string | null>(null);
  const [tested, setTested] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [, run] = useSafeTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      let next: Support = "ok";
      let perm: NotificationPermission = "default";
      let current: string | null = null;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // En iPhone los avisos existen solo con la app agregada a la pantalla de inicio.
        next = ios && !standalone ? "ios-install" : "unsupported";
      } else {
        perm = Notification.permission;
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg && process.env.NODE_ENV !== "production") next = "no-sw";
        current = reg ? ((await reg.pushManager.getSubscription())?.endpoint ?? null) : null;
      }
      if (!alive) return;
      setSupport(next);
      setPermission(perm);
      setEndpoint(current);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const here = endpoint ? devices.find((d) => d.endpoint === endpoint) : undefined;

  async function activate() {
    if (!publicKey) return;
    setBusy("activar");
    setNote(null);
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      // El service worker se registra solo en la versión publicada (Shell); por si todavía no.
      if (!reg && process.env.NODE_ENV === "production") {
        await navigator.serviceWorker.register("/sw.js");
        reg = await navigator.serviceWorker.ready;
      }
      if (!reg) {
        setNote({ ok: false, text: "Sin service worker no hay avisos: probalo en la versión publicada." });
        return;
      }
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setNote({ ok: false, text: perm === "denied" ? "Bloqueaste los avisos para esta app." : "No diste permiso para los avisos." });
        return;
      }
      const key = keyBytes(publicKey);
      let sub = await reg.pushManager.getSubscription();
      // Una suscripción hecha con otras claves no sirve: se rehace.
      if (sub && !sameKey(sub.options.applicationServerKey, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      try {
        await savePushSubscription(sub.toJSON(), navigator.userAgent);
      } catch (e) {
        setNote({ ok: false, text: actionErrorText(e) });
        return;
      }
      setEndpoint(sub.endpoint);
      setNote({ ok: true, text: "Listo: este aparato recibe los avisos. Probá con “Mandar un aviso de prueba”." });
    } catch (e) {
      console.warn("No se pudieron activar los avisos:", e);
      setNote({ ok: false, text: "El navegador no dejó activar los avisos. Probá de nuevo en un rato." });
    } finally {
      setBusy(null);
    }
  }

  async function deactivate() {
    setBusy("desactivar");
    setNote(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      const ep = sub?.endpoint ?? endpoint;
      await sub?.unsubscribe();
      if (ep) await removePushSubscription({ endpoint: ep });
      setEndpoint(null);
      setNote({ ok: true, text: "Listo: este aparato ya no recibe avisos." });
    } catch (e) {
      setNote({ ok: false, text: actionErrorText(e) });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("prueba");
    setNote(null);
    try {
      const r = await sendTestPush(endpoint ?? undefined);
      setNote({ ok: r.ok, text: r.message });
    } catch (e) {
      setNote({ ok: false, text: actionErrorText(e) });
    } finally {
      setBusy(null);
    }
  }

  function change(next: ReminderPrefs) {
    const before = prefs;
    setPrefs(next);
    run(() => saveReminderPrefs(next), { onError: () => setPrefs(before) });
  }

  async function testDevice(d: Device) {
    setTesting(d.id);
    setTested(null);
    try {
      const r = await sendTestPush(undefined, d.id);
      setTested({ id: d.id, ok: r.ok, text: r.message });
    } catch (e) {
      setTested({ id: d.id, ok: false, text: actionErrorText(e) });
    } finally {
      setTesting(null);
    }
  }

  function remove(d: Device) {
    run(async () => {
      await removePushSubscription({ id: d.id });
      if (d.endpoint === endpoint) setEndpoint(null);
    });
  }

  let status: React.ReactNode;
  if (!tableReady) status = "Falta aplicar la migración de avisos en la base.";
  else if (!publicKey) status = "Faltan las claves de avisos (VAPID) en el servidor.";
  else if (support === "checking") status = "Revisando este aparato…";
  else if (support === "unsupported") status = "Este navegador no admite avisos.";
  else if (support === "ios-install") status = "En iPhone, primero agregá la app a la pantalla de inicio (Compartir → Agregar a inicio) y abrila desde ahí.";
  else if (support === "no-sw") status = "En la compu de desarrollo no hay service worker: los avisos se activan en la versión publicada.";
  else if (permission === "denied") status = "Bloqueaste los avisos para esta app. Habilitalos en los ajustes del sitio (el candado al lado de la dirección, o Ajustes → Apps en el celular) y volvé a esta pantalla.";
  else if (here) status = "Activados en este aparato.";
  else status = "Este aparato todavía no recibe avisos.";

  const canActivate = tableReady && !!publicKey && support === "ok" && permission !== "denied";

  return (
    <>
      <PageHeader title="Avisos" kicker="Recordatorios en el celular" wide />
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 pt-2 pb-16 lg:grid-cols-12 lg:gap-5 lg:px-10 lg:pt-4">
        <TintedCard
          icon={DeviceMobile}
          title="Este aparato"
          meta={here ? "Recibe avisos" : support === "checking" ? "Revisando…" : "Sin avisos"}
          className="lg:col-span-5 lg:self-start"
        >
          <p className="text-[13.5px] leading-relaxed text-muted">{status}</p>

          <div className="flex flex-wrap gap-2">
            {here ? (
              <>
                <Button onClick={test} disabled={busy !== null}>
                  <PaperPlaneTilt size={16} aria-hidden />
                  {busy === "prueba" ? "Mandando…" : "Mandar un aviso de prueba"}
                </Button>
                <Button variant="outline" onClick={deactivate} disabled={busy !== null}>
                  <BellSlash size={16} aria-hidden />
                  {busy === "desactivar" ? "Desactivando…" : "Desactivar acá"}
                </Button>
              </>
            ) : (
              <Button onClick={activate} disabled={!canActivate || busy !== null}>
                <Bell size={16} aria-hidden />
                {busy === "activar" ? "Activando…" : "Activar avisos en este aparato"}
              </Button>
            )}
          </div>

          {note && (
            <p
              role="status"
              className={cx(
                "reveal flex gap-2 rounded-xl p-3 text-[13px] leading-relaxed",
                note.ok ? "bg-[var(--st-done-bg)] text-[var(--st-done-fg)]" : "bg-[var(--st-fail-bg)] text-[var(--st-fail-fg)]",
              )}
            >
              {note.ok ? (
                <CheckCircle size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
              ) : (
                <WarningCircle size={17} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
              )}
              {note.text}
            </p>
          )}

          {devices.length > 0 && (
            <div className="grid gap-2">
              <h3 className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">Aparatos con avisos · {devices.length}</h3>
              <p className="text-[12.5px] leading-relaxed text-muted">
                “Probar” manda un aviso de prueba a ese aparato. El reloj no aparece aparte: recibe lo que le llega al celular.
              </p>
              <ul className="grid divide-y divide-line overflow-hidden rounded-xl border border-line">
                {devices.map((d) => (
                  <li key={d.id} className="grid gap-2 px-3 py-2">
                    <div className="flex min-h-10 items-center gap-2">
                    <div className="grid min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[14px]">
                        <span className="truncate">{d.label}</span>
                        {d.endpoint === endpoint && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] text-muted">Este</span>}
                      </span>
                      <span className="text-[12.5px] text-muted">
                        Desde el {day.format(new Date(d.createdAt))}
                        {d.lastUsedAt ? ` · último aviso ${when.format(new Date(d.lastUsedAt))}` : ""}
                      </span>
                    </div>
                    <Button size="sm" onClick={() => testDevice(d)} disabled={testing !== null}>
                      <PaperPlaneTilt size={15} aria-hidden />
                      {testing === d.id ? "Mandando…" : "Probar"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(d)}>
                      Quitar
                    </Button>
                    </div>
                    {tested?.id === d.id && (
                      <p role="status" className={cx("reveal text-[12.5px]", tested.ok ? "text-[var(--st-done-fg)]" : "text-[var(--st-fail-fg)]")}>
                        {tested.text}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TintedCard>

        <div className="grid content-start gap-4 lg:col-span-7 lg:gap-5">
          <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
            Prendé los que quieras y elegí la hora, los días y a qué aparato llegan. Salen una vez por día, dentro de la hora
            elegida (con 21:00, entre las 21:00 y las 21:59), y solo si hay algo para avisar. Lo que llega al celular también
            llega al reloj.
          </p>
          <CustomReminders
            items={prefs.custom}
            onChange={(custom) => change({ ...prefs, custom })}
            devices={devices.map((d) => ({ id: d.id, label: d.label, here: d.endpoint === endpoint }))}
            today={today}
          />
          <ReminderGroups
            prefs={prefs}
            onChange={change}
            preview={preview}
            habitPreview={habitPreview}
            habits={habits}
            devices={devices.map((d) => ({ id: d.id, label: d.label, here: d.endpoint === endpoint }))}
          />
          <p className="max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
            ¿Y un aviso justo antes de cada bloque? El plan gratis de Vercel solo corre tareas programadas una vez por día y sin
            minuto exacto, así que no se puede avisar “empieza en 15 minutos”. En su lugar está el Plan del día a la mañana.
          </p>
        </div>
      </main>
    </>
  );
}
