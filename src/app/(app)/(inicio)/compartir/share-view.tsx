"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CaretRight, Notebook, Receipt, Wallet } from "@phosphor-icons/react";
import { shareToJournal } from "@/lib/journal-actions";
import { sendPhoto } from "@/components/photos";
import { PageHeader } from "@/components/page-header";
import { cx } from "@/components/ui";

type Recent = { id: string; label: string; sub: string; amount: string };

const SHARE_CACHE = "compartido";

/** Las fotos que dejó el service worker: "id:cantidad" → blobs. */
async function loadShared(ref: string): Promise<{ keys: string[]; blobs: Blob[] }> {
  const [id, n] = ref.split(":");
  if (!/^\d+$/.test(id ?? "") || !("caches" in window)) return { keys: [], blobs: [] };
  const cache = await caches.open(SHARE_CACHE);
  const keys = Array.from({ length: Math.min(10, Number(n) || 0) }, (_, i) => `/compartido/${id}/${i}`);
  const blobs: Blob[] = [];
  for (const k of keys) {
    const r = await cache.match(k);
    if (r) blobs.push(await r.blob());
  }
  return { keys, blobs };
}

async function forget(keys: string[]) {
  if (!("caches" in window)) return;
  const cache = await caches.open(SHARE_CACHE);
  await Promise.all(keys.map((k) => cache.delete(k)));
}

export function ShareView({ title, text, url, photos, recent }: { title: string; text: string; url: string; photos: string; recent: Recent[] }) {
  const router = useRouter();
  // Muchas apps mandan el link también dentro del texto: no se repite.
  const parts = [title, text, url && !text.includes(url) ? url : ""].filter((x, i, a) => x && a.indexOf(x) === i);
  const content = parts.join("\n");
  const [shared, setShared] = useState<{ keys: string[]; blobs: Blob[]; urls: string[] }>({ keys: [], blobs: [], urls: [] });
  const [picking, setPicking] = useState(false);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!photos) return;
    let urls: string[] = [];
    void loadShared(photos).then(({ keys, blobs }) => {
      urls = blobs.map((b) => URL.createObjectURL(b));
      setShared({ keys, blobs, urls });
    });
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const hasPhotos = shared.blobs.length > 0;

  function toJournal() {
    setError(null);
    start(async () => {
      try {
        const { id } = await shareToJournal(content);
        for (const b of shared.blobs) await sendPhoto(b, { journalEntryId: id });
        await forget(shared.keys);
        router.push(`/journal/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  function toMovement(id: string) {
    setError(null);
    start(async () => {
      try {
        for (const b of shared.blobs) await sendPhoto(b, { transactionId: id });
        await forget(shared.keys);
        router.push("/gastos");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo adjuntar.");
      }
    });
  }

  const nothing = !content && !photos;

  return (
    <>
      <PageHeader title="Compartir" kicker="Guardar en Second Brain" />
      <main className="mx-auto grid max-w-3xl gap-4 px-4 pt-2 pb-16 lg:px-10">
        {nothing ? (
          <p className="rounded-[20px] border border-line bg-surface p-5 text-[14px] text-muted">
            No llegó nada. Desde otra app, tocá Compartir y elegí Second Brain.
          </p>
        ) : (
          <section className="grid gap-3 rounded-[20px] border border-line bg-surface p-4 lg:p-5">
            <h2 className="kicker">Lo que compartiste</h2>
            {content && <p className="text-[15px] leading-relaxed break-words whitespace-pre-line">{content}</p>}
            {hasPhotos && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {shared.urls.map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" className="aspect-square rounded-xl object-cover ring-1 ring-line" />
                ))}
              </div>
            )}
            {photos && !hasPhotos && <p className="text-[13px] text-muted">Cargando las fotos…</p>}
          </section>
        )}

        {!nothing && (
          <section className="grid gap-2">
            <Option icon={Notebook} color="var(--c-journal)" title="Al journal de hoy" sub="Se agrega al final de la entrada de hoy (o crea una)." onClick={toJournal} disabled={busy} />
            {content && (
              <Option
                icon={Wallet}
                color="var(--c-gastos)"
                title="Cargar como gasto"
                sub="Abre la hoja de carga con esto de título."
                onClick={() => router.push(`/gastos?nuevo=1&titulo=${encodeURIComponent((title || text).slice(0, 120))}`)}
                disabled={busy}
              />
            )}
            {hasPhotos && (
              <Option
                icon={Receipt}
                color="var(--c-gastos)"
                title="Comprobante de un movimiento"
                sub="Elegí a qué movimiento reciente se adjunta."
                onClick={() => setPicking((x) => !x)}
                disabled={busy}
              />
            )}
            {picking && (
              <ul className="grid divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-surface">
                {recent.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toMovement(t.id)}
                      className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
                    >
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-[14.5px] font-medium">{t.label}</span>
                        <span className="truncate text-[12.5px] text-muted">{t.sub}</span>
                      </span>
                      <span className="font-mono text-[13.5px] tabular">{t.amount}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {busy && <p className="text-[13.5px] text-muted">Guardando…</p>}
        {error && (
          <p role="alert" className="text-[13.5px] text-danger">
            {error}
          </p>
        )}
      </main>
    </>
  );
}

function Option({
  icon: Ico,
  color,
  title,
  sub,
  onClick,
  disabled,
}: {
  icon: typeof Notebook;
  color: string;
  title: string;
  sub: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex min-h-16 items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3 text-left transition-[opacity,transform] hover:bg-surface-2 active:scale-[0.99] disabled:opacity-50",
      )}
    >
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: color }}>
        <Ico size={19} weight="fill" aria-hidden />
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-[12.5px] text-muted">{sub}</span>
      </span>
      <CaretRight size={16} className="shrink-0 text-muted" aria-hidden />
    </button>
  );
}
