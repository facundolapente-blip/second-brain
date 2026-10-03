import Link from "next/link";
import { BookOpen } from "@phosphor-icons/react/dist/ssr";

export default function EntryNotFound() {
  return (
    <main className="mx-auto grid max-w-[42rem] justify-items-start gap-3 px-5 pt-[calc(4rem+env(safe-area-inset-top))]">
      <span className="inline-flex size-10 items-center justify-center rounded-[10px] bg-surface-2 text-muted">
        <BookOpen size={22} aria-hidden />
      </span>
      <h1 className="font-serif text-[26px] leading-tight font-semibold tracking-tight">Esta entrada no existe</h1>
      <p className="max-w-[44ch] text-sm leading-relaxed text-muted">
        Puede que la hayas borrado o que el enlace esté mal. Las demás siguen en su lugar.
      </p>
      <Link
        href="/journal"
        className="btn-glow mt-1 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-on-accent transition-[filter,transform] duration-300 ease-spring hover:brightness-105 active:scale-[0.97]"
      >
        Volver a las entradas
      </Link>
    </main>
  );
}
