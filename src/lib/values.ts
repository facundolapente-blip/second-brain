/**
 * Valores (Herramientas → Valores, pedido de Facu 2026-10-18): un texto libre, como su página
 * "Manifest" de Notion, guardado en `AppSetting "valores"`. Cada nota que sale en la tarjeta de
 * Inicio es un renglón de lista ("- ", "• ", "1. ") o un párrafo; los títulos ("# ...") no salen
 * solos: agrupan y se ven como rótulo de las notas que tienen debajo. Lo que está bajo un título
 * que empieza con "Referencia" (listas largas, como el medidor emocional) queda en Valores pero
 * no sale en Inicio.
 */
export const VALUES_KEY = "valores";

export type ValueNote = { text: string; section: string | null };

const BULLET = /^\s*(?:[-*•–]|\d+[.)])\s+/;
const HEADING = /^\s*#{1,6}\s+/;

export function parseValueNotes(raw: string | null | undefined): ValueNote[] {
  const notes: ValueNote[] = [];
  let section: string | null = null;
  let reference = false;
  let para: string[] = [];
  const flush = () => {
    const t = para.join(" ").replace(/\s+/g, " ").trim();
    if (t && !reference) notes.push({ text: t, section });
    para = [];
  };
  for (const line of (raw ?? "").split(/\r?\n/)) {
    if (!line.trim()) {
      flush();
    } else if (HEADING.test(line)) {
      flush();
      section = line.replace(HEADING, "").replace(/[*_`]/g, "").trim() || null;
      reference = /^referencia/i.test(section ?? "");
    } else if (BULLET.test(line)) {
      flush();
      para = [line.replace(BULLET, "")];
      flush();
    } else {
      para.push(line.trim());
    }
  }
  flush();
  // Sin marcas de Markdown sueltas (negritas o cursivas pegadas desde Notion).
  return notes.map((n) => ({ ...n, text: n.text.replace(/\*\*|__|`/g, "") }));
}
