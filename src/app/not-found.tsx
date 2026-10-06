import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-[42rem] content-center justify-items-start gap-3 px-5">
      <p className="kicker">Error 404</p>
      <h1 className="display text-[34px]">Esta página no existe</h1>
      <p className="max-w-[52ch] text-[15px] leading-relaxed text-muted">
        Puede que el enlace esté mal o que lo que buscabas se haya borrado.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-medium text-on-ink transition-opacity hover:opacity-85"
      >
        Ir al inicio
      </Link>
    </main>
  );
}
