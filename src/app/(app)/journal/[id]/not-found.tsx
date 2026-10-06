import Link from "next/link";
import { BookOpen } from "@phosphor-icons/react/dist/ssr";

export default function EntryNotFound() {
  return (
    <main className="mx-auto grid max-w-[42rem] justify-items-start gap-3 px-5 pt-[calc(4rem+env(safe-area-inset-top))]">
      <p className="kicker flex items-center gap-1.5">
        <BookOpen size={14} aria-hidden /> Journal
      </p>
      <h1 className="display text-[34px]">Esta entrada no existe</h1>
      <p className="max-w-[52ch] text-[15px] leading-relaxed text-muted">
        Puede que la hayas borrado o que el enlace esté mal. Las demás siguen en su lugar.
      </p>
      <Link
        href="/journal"
        className="mt-2 inline-flex h-11 items-center rounded-[4px] bg-ink px-4 text-sm font-medium text-on-ink transition-opacity hover:opacity-85"
      >
        Volver a las entradas
      </Link>
    </main>
  );
}
