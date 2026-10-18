"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CloudArrowUp, WarningCircle } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { cx, inputClass } from "@/components/ui";
import { notifyError } from "@/components/undo-toast";
import { saveValues } from "@/lib/offline/values";
import { parseValueNotes } from "@/lib/values";

type Status = "saved" | "dirty" | "saving" | "error";

/**
 * Valores: un texto libre (el "Manifest" de Facu). Se guarda solo mientras se escribe
 * (900 ms después de la última tecla, al salir del campo y al ocultar la página), siempre
 * uno a la vez y con lo último. Cada renglón de lista o párrafo es una nota de la tarjeta de Inicio.
 */
export function ValuesView({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<Status>("saved");
  const latest = useRef(initial);
  const saved = useRef(initial);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function flush() {
    clearTimeout(timer.current);
    if (running.current || latest.current === saved.current) return;
    running.current = true;
    const value = latest.current;
    setStatus("saving");
    try {
      await saveValues(value);
      saved.current = value;
      setStatus(latest.current === value ? "saved" : "dirty");
    } catch {
      setStatus("error");
      notifyError("No se pudieron guardar tus valores. Probá de nuevo.");
    } finally {
      running.current = false;
    }
    // Si se siguió escribiendo mientras guardaba, va lo último.
    if (latest.current !== saved.current) timer.current = setTimeout(flush, 300);
  }

  useEffect(() => {
    const hide = () => document.visibilityState === "hidden" && void flush();
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notes = parseValueNotes(text);

  return (
    <>
      <PageHeader title="Valores" kicker="Lo que querés tener presente" wide />
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pt-2 pb-16 lg:grid-cols-12 lg:gap-8 lg:px-10 lg:pt-4">
        <section className="grid content-start gap-3 lg:col-span-7">
          <div className="flex items-center justify-between gap-3">
            <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-muted">
              Escribí tus valores, principios o tu manifiesto. Cada renglón con guion o cada párrafo es una nota, y los títulos
              con # las agrupan. En Inicio sale una nota distinta cada 6 horas. Lo que va bajo un título que empieza con
              “Referencia” queda acá pero no sale en Inicio.
            </p>
            <SaveState status={status} />
          </div>
          <textarea
            spellCheck
            lang="es"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              latest.current = e.target.value;
              setStatus("dirty");
              clearTimeout(timer.current);
              timer.current = setTimeout(flush, 900);
            }}
            onBlur={() => void flush()}
            placeholder={"# Disciplina\n- Hago lo difícil primero.\n- La constancia le gana al talento.\n\n# Cómo quiero vivir\nPresente, sin apuro, con la gente que quiero."}
            className={cx(inputClass, "autogrow min-h-[55dvh] w-full resize-none py-3 text-[15.5px] leading-[1.7]")}
          />
        </section>

        <aside className="grid content-start gap-3 lg:col-span-5">
          <h2 className="text-[15px] font-semibold">
            Así salen en Inicio <span className="font-mono text-[13px] font-normal text-muted">· {notes.length === 1 ? "1 nota" : `${notes.length} notas`}</span>
          </h2>
          {notes.length === 0 ? (
            <p className="text-[13.5px] text-muted">Todavía no hay notas. Cuando escribas, acá vas a ver cómo se separan.</p>
          ) : (
            <ol className="grid gap-2">
              {notes.map((n, i) => (
                <li key={i} className="rounded-2xl bg-[var(--quote-bg)] px-4 py-3">
                  <p className="text-[14.5px] leading-snug font-medium text-[var(--quote-fg)]">“{n.text}”</p>
                  {n.section && <p className="mt-1.5 font-mono text-[10.5px] tracking-[0.06em] text-[var(--quote-sub)] uppercase">{n.section}</p>}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </main>
    </>
  );
}

function SaveState({ status }: { status: Status }) {
  const map = {
    saved: { icon: <Check size={14} weight="bold" />, text: "Guardado" },
    dirty: { icon: <CloudArrowUp size={14} />, text: "Sin guardar" },
    saving: { icon: <CloudArrowUp size={14} />, text: "Guardando" },
    error: { icon: <WarningCircle size={14} weight="fill" />, text: "No se guardó" },
  }[status];
  return (
    <span role="status" className={cx("inline-flex shrink-0 items-center gap-1.5 font-mono text-[12px]", status === "error" ? "text-danger" : "text-muted")}>
      {map.icon}
      {map.text}
    </span>
  );
}
