"use client";

import { File, FileAudio, FileDoc, FileImage, FilePdf, FilePpt, FileVideo, FileXls, FileZip, type Icon } from "@phosphor-icons/react";
import { cx } from "@/components/ui";
import { photoUrl } from "@/components/photos";
import { fileKind, fileSizeText, type FileKind, type NoteFile } from "@/lib/notes-logic";

const LOOK: Record<FileKind, { icon: Icon; label: string; color: string }> = {
  pdf: { icon: FilePdf, label: "PDF", color: "red" },
  doc: { icon: FileDoc, label: "Documento", color: "blue" },
  sheet: { icon: FileXls, label: "Planilla", color: "green" },
  slides: { icon: FilePpt, label: "Presentación", color: "orange" },
  video: { icon: FileVideo, label: "Video", color: "purple" },
  audio: { icon: FileAudio, label: "Audio", color: "teal" },
  image: { icon: FileImage, label: "Imagen", color: "pink" },
  zip: { icon: FileZip, label: "Comprimido", color: "brown" },
  other: { icon: File, label: "Archivo", color: "stone" },
};

/**
 * Los documentos de una nota (PDF, Word, videos… que llegaron por WhatsApp): una fila por
 * archivo con su ícono, nombre y peso; tocarla lo abre en otra pestaña (o lo baja).
 */
export function NoteFiles({ files, className }: { files: NoteFile[]; className?: string }) {
  return (
    <ul className={cx("relative z-[1] grid gap-1.5", className)}>
      {files.map((f) => {
        const kind = fileKind(f.name, f.contentType);
        const look = LOOK[kind];
        const Ico = look.icon;
        return (
          <li key={f.id}>
            <a
              href={photoUrl(f.id)}
              target="_blank"
              rel="noopener"
              onClick={(e) => e.stopPropagation()}
              className="press tap-tint flex min-h-12 items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-2.5 py-2 hover:bg-surface-3"
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-lg"
                style={{ background: `var(--p-${look.color}-chip)`, color: `var(--p-${look.color}-chip-fg)` }}
                aria-hidden
              >
                <Ico size={19} weight="fill" />
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-[14px] font-medium text-fg">{f.name}</span>
                <span className="font-mono text-[11.5px] text-muted">
                  {look.label} · {fileSizeText(f.size)}
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
