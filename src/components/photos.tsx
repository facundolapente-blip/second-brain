"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, CircleNotch, Trash, X } from "@phosphor-icons/react";
import { deletePhoto, uploadPhoto } from "@/lib/photo-actions";
import { cx } from "./ui";

export type Photo = { id: string; width: number | null; height: number | null };
type Owner = { journalEntryId: string } | { transactionId: string };

/** Lado más largo al subir: alcanza para verla a pantalla completa y pesa ~300 KB. */
const MAX_SIDE = 1600;

/** Achica y pasa a JPEG en el navegador (las del celular pesan 3-8 MB). */
export async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * k);
  const height = Math.round(bmp.height * k);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("No se pudo leer la foto"))), "image/jpeg", 0.82));
  return { blob, width, height };
}

/** Sube una foto a una entrada o un movimiento. */
export async function sendPhoto(file: File | Blob, owner: Owner): Promise<Photo> {
  const { blob, width, height } = await shrink(file instanceof File ? file : new File([file], "foto.jpg", { type: file.type }));
  const fd = new FormData();
  fd.set("foto", new File([blob], "foto.jpg", { type: "image/jpeg" }));
  fd.set("width", String(width));
  fd.set("height", String(height));
  if ("journalEntryId" in owner) fd.set("journalEntryId", owner.journalEntryId);
  else fd.set("transactionId", owner.transactionId);
  const r = await uploadPhoto(fd);
  if (!r.ok) throw new Error(r.error);
  return r.photo;
}

export const photoUrl = (id: string) => `/api/foto/${id}`;

/**
 * Fotos de una entrada o comprobantes de un movimiento: grilla de miniaturas,
 * se tocan para verlas grandes. Con `owner` se pueden agregar y sacar.
 */
export function PhotoStrip({
  photos: initial,
  owner,
  label = "Agregar foto",
  onCountChange,
  className,
}: {
  photos: Photo[];
  owner?: Owner;
  label?: string;
  onCountChange?: (n: number) => void;
  className?: string;
}) {
  const [photos, setPhotos] = useState(initial);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Photo | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => onCountChange?.(photos.length + uploading), [photos.length, uploading, onCountChange]);

  async function add(files: FileList | null) {
    if (!owner || !files?.length) return;
    setError(null);
    const list = [...files].slice(0, 10);
    setUploading((n) => n + list.length);
    for (const f of list) {
      try {
        const p = await sendPhoto(f, owner);
        setPhotos((x) => [...x, p]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  if (!owner && photos.length === 0) return null;

  return (
    <div className={cx("grid gap-2", className)}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(p)}
            className="relative aspect-square overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line"
            aria-label="Ver foto"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(p.id)} alt="" loading="lazy" className="size-full object-cover" />
          </button>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <span key={`u${i}`} className="inline-flex aspect-square items-center justify-center rounded-xl bg-surface-2 text-muted">
            <CircleNotch size={20} className="animate-spin" aria-label="Subiendo" />
          </span>
        ))}
        {owner && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={cx(
              "inline-flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-fg",
              photos.length + uploading === 0 ? "col-span-3 h-12 flex-row sm:col-span-4" : "aspect-square",
            )}
          >
            <Camera size={18} aria-hidden />
            {label}
          </button>
        )}
      </div>
      {owner && (
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = "";
          }}
        />
      )}
      {error && (
        <p role="alert" className="reveal text-[13px] text-danger">
          {error}
        </p>
      )}
      {open && (
        <Lightbox
          photo={open}
          onClose={() => setOpen(null)}
          onDelete={
            owner
              ? () => {
                  const id = open.id;
                  setPhotos((x) => x.filter((p) => p.id !== id));
                  setOpen(null);
                  void deletePhoto(id);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function Lightbox({ photo, onClose, onDelete }: { photo: Photo; onClose: () => void; onDelete?: () => void }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Foto" className="fixed inset-0 z-50 grid grid-rows-[auto_1fr] bg-black/90" onClick={onClose}>
      <div className="flex justify-end gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]" onClick={(e) => e.stopPropagation()}>
        {onDelete &&
          (confirm ? (
            <button type="button" onClick={onDelete} className="inline-flex h-10 items-center gap-2 rounded-full bg-danger px-4 text-[14px] font-medium text-white">
              <Trash size={16} aria-hidden /> Sí, sacarla
            </button>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} aria-label="Sacar foto" className="inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
              <Trash size={18} />
            </button>
          ))}
        <button type="button" onClick={onClose} aria-label="Cerrar" className="inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
          <X size={18} />
        </button>
      </div>
      <div className="flex min-h-0 items-center justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl(photo.id)} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      </div>
    </div>,
    document.body,
  );
}
