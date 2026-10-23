import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

/** Une clases (propio: `cx` de ui.tsx es de cliente y esta tarjeta también se usa en páginas del servidor). */
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Módulo cuyo color pinta la cabecera; sin `tone`, el del módulo de la página. */
export type CardTone = "habitos" | "journal" | "gastos" | "plan" | "notas" | "inicio";

export type CardAction = { href: string; label: string } | React.ReactNode;

function isLinkAction(a: CardAction): a is { href: string; label: string } {
  return !!a && typeof a === "object" && "href" in a && "label" in a;
}

/**
 * Tarjeta con cabecera teñida (diseño 4): banda con el tono suave del color del módulo,
 * ícono en cuadrado lleno, título, un dato en mono y la acción en píldora; cuerpo blanco.
 * `progress` (0 a 1) dibuja una barra fina dentro de la banda (nunca anillos).
 */
export function TintedCard({
  tone,
  icon: Ico,
  title,
  meta,
  action,
  progress,
  headExtra,
  children,
  className,
  bodyClassName,
  id,
  as: Tag = "section",
}: {
  tone?: CardTone;
  icon: Icon;
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: CardAction;
  progress?: number | null;
  /** Algo más dentro de la banda, debajo del título (un selector, por ejemplo). */
  headExtra?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  as?: "section" | "div" | "article";
}) {
  const label = typeof title === "string" ? title : undefined;
  return (
    <Tag id={id} data-tone={tone} aria-label={label} className={cx("tcard", className)}>
      <header className="tcard-head">
        <span className="tcard-ico" aria-hidden>
          <Ico size={18} weight="fill" />
        </span>
        <span className="grid min-w-0 gap-0.5">
          <h2 className="tcard-title truncate">{title}</h2>
          {meta && <span className="tcard-meta max-sm:line-clamp-2 sm:truncate">{meta}</span>}
        </span>
        {action ? (
          isLinkAction(action) ? (
            <Link href={action.href} className="tcard-pill press">
              {action.label} <ArrowRight size={13} aria-hidden />
            </Link>
          ) : (
            action
          )
        ) : (
          <span />
        )}
        {progress !== undefined && progress !== null && (
          <span className="tcard-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
          </span>
        )}
        {headExtra && <div className="col-span-3 mt-2.5 min-w-0">{headExtra}</div>}
      </header>
      <div className={cx("tcard-body", bodyClassName)}>{children}</div>
    </Tag>
  );
}

/** Tarjeta de cifra (las del resumen): cabecera chica teñida, cifra grande, una línea y un gráfico chico. */
export function StatTile({
  tone,
  icon: Ico,
  label,
  href,
  figure,
  unit,
  sub,
  children,
  className,
}: {
  tone?: CardTone;
  icon: Icon;
  label: string;
  href?: string;
  figure: React.ReactNode;
  unit?: React.ReactNode;
  sub?: React.ReactNode;
  /** El gráfico chico de abajo. */
  children?: React.ReactNode;
  className?: string;
}) {
  const inner = (
    <>
      <header className="tcard-head">
        <span className="tcard-ico" aria-hidden>
          <Ico size={15} weight="fill" />
        </span>
        <span className="tcard-title truncate">{label}</span>
        {href ? <ArrowUpRight size={14} className="opacity-60" aria-hidden /> : <span />}
      </header>
      <div className="tcard-body">
        <span className="tstat-fig">
          {figure}
          {unit && <small>{unit}</small>}
        </span>
        {sub && <span className="tstat-sub">{sub}</span>}
        {children && <div className="mt-auto grid gap-1.5 pt-1.5">{children}</div>}
      </div>
    </>
  );
  return href ? (
    <Link href={href} data-tone={tone} className={cx("tcard tstat lift", className)}>
      {inner}
    </Link>
  ) : (
    <div data-tone={tone} className={cx("tcard tstat", className)}>
      {inner}
    </div>
  );
}
