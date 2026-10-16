/**
 * Frases de Inicio (pedido de Facu, 2026-10-16): estoicos, traducidas lo más fiel posible al
 * original latino o griego, cada una con su obra y lugar. Nada de paráfrasis "modernas".
 * Para sumar una: que sea del texto (verificable) y con la referencia exacta.
 */
export type Quote = { text: string; author: string; source: string };

export const QUOTES: Quote[] = [
  // Séneca, Sobre la brevedad de la vida
  { text: "No tenemos poco tiempo, sino que perdemos mucho.", author: "Séneca", source: "Sobre la brevedad de la vida, 1.3" },
  { text: "La vida, si sabes usarla, es larga.", author: "Séneca", source: "Sobre la brevedad de la vida, 2.1" },
  { text: "Nada es menos propio del hombre ocupado que vivir.", author: "Séneca", source: "Sobre la brevedad de la vida, 7.3" },
  { text: "El mayor obstáculo para vivir es la espera, que depende del mañana y pierde el hoy.", author: "Séneca", source: "Sobre la brevedad de la vida, 9.1" },
  { text: "Todo lo que ha de venir está en lo incierto: vive ya.", author: "Séneca", source: "Sobre la brevedad de la vida, 9.1" },
  // Séneca, Cartas a Lucilio
  { text: "Reivindícate para ti mismo, y el tiempo que hasta ahora te quitaban, te robaban o se te escapaba, recógelo y guárdalo.", author: "Séneca", source: "Cartas a Lucilio, 1.1" },
  { text: "Mientras se aplaza, la vida pasa.", author: "Séneca", source: "Cartas a Lucilio, 1.3" },
  { text: "No está en ninguna parte quien está en todas partes.", author: "Séneca", source: "Cartas a Lucilio, 2.2" },
  { text: "No es pobre el que tiene poco, sino el que desea más.", author: "Séneca", source: "Cartas a Lucilio, 2.6" },
  { text: "Retírate en ti mismo cuanto puedas.", author: "Séneca", source: "Cartas a Lucilio, 7.8" },
  { text: "Los hombres, mientras enseñan, aprenden.", author: "Séneca", source: "Cartas a Lucilio, 7.8" },
  { text: "Son más las cosas que nos asustan que las que nos oprimen, y sufrimos más a menudo por la opinión que por la realidad.", author: "Séneca", source: "Cartas a Lucilio, 13.4" },
  { text: "La filosofía no está en las palabras, sino en los hechos.", author: "Séneca", source: "Cartas a Lucilio, 16.3" },
  { text: "La verdadera alegría es cosa seria.", author: "Séneca", source: "Cartas a Lucilio, 23.4" },
  { text: "Morimos cada día.", author: "Séneca", source: "Cartas a Lucilio, 24.20" },
  { text: "Tienes que cambiar de ánimo, no de cielo.", author: "Séneca", source: "Cartas a Lucilio, 28.1" },
  { text: "Para quien no sabe a qué puerto se dirige, ningún viento es favorable.", author: "Séneca", source: "Cartas a Lucilio, 71.3" },
  { text: "No es porque las cosas sean difíciles que no nos atrevemos; es porque no nos atrevemos que son difíciles.", author: "Séneca", source: "Cartas a Lucilio, 104.26" },
  // Séneca, otros diálogos
  { text: "El mayor remedio de la ira es la demora.", author: "Séneca", source: "Sobre la ira, 2.29" },
  { text: "La desgracia es ocasión de virtud.", author: "Séneca", source: "Sobre la providencia, 4.6" },
  { text: "El fuego prueba al oro; la desgracia, a los hombres fuertes.", author: "Séneca", source: "Sobre la providencia, 5.10" },
  // Marco Aurelio, Meditaciones
  { text: "Haz, di y piensa cada cosa como quien ya puede salir de la vida.", author: "Marco Aurelio", source: "Meditaciones, 2.11" },
  { text: "Aunque fueras a vivir tres mil años, o diez veces eso, recuerda que nadie pierde otra vida que la que vive.", author: "Marco Aurelio", source: "Meditaciones, 2.14" },
  { text: "No gastes la parte de vida que te queda en pensar en los demás.", author: "Marco Aurelio", source: "Meditaciones, 3.4" },
  { text: "El universo es cambio; la vida, opinión.", author: "Marco Aurelio", source: "Meditaciones, 4.3" },
  { text: "No vivas como si fueras a vivir diez mil años. La muerte pende sobre ti. Mientras vives, mientras puedes, hazte bueno.", author: "Marco Aurelio", source: "Meditaciones, 4.17" },
  { text: "Haz pocas cosas, si quieres estar tranquilo.", author: "Marco Aurelio", source: "Meditaciones, 4.24" },
  { text: "Sé como el promontorio contra el que rompen sin cesar las olas: él se mantiene firme, y a su alrededor se calma el hervor del agua.", author: "Marco Aurelio", source: "Meditaciones, 4.49" },
  { text: "Al amanecer, cuando te cueste levantarte, ten presente: me levanto para hacer obra de hombre.", author: "Marco Aurelio", source: "Meditaciones, 5.1" },
  { text: "Tal como sean tus pensamientos habituales, así será tu mente, porque el alma se tiñe de sus pensamientos.", author: "Marco Aurelio", source: "Meditaciones, 5.16" },
  { text: "Lo que estorba la acción se vuelve avance de la acción, y lo que se interpone en el camino se vuelve camino.", author: "Marco Aurelio", source: "Meditaciones, 5.20" },
  { text: "La mejor manera de vengarse es no volverse semejante.", author: "Marco Aurelio", source: "Meditaciones, 6.6" },
  { text: "Cava dentro de ti. Dentro está la fuente del bien, que siempre puede brotar si siempre cavas.", author: "Marco Aurelio", source: "Meditaciones, 7.59" },
  { text: "Es propio de un carácter perfecto vivir cada día como el último, sin agitarse, sin aletargarse, sin fingir.", author: "Marco Aurelio", source: "Meditaciones, 7.69" },
  { text: "Que no te turbe el futuro: llegarás a él, si hace falta, con la misma razón que ahora usas para el presente.", author: "Marco Aurelio", source: "Meditaciones, 7.8" },
  { text: "Si te aflige algo externo, no es eso lo que te molesta, sino tu juicio sobre eso; y borrar ese juicio está en tus manos.", author: "Marco Aurelio", source: "Meditaciones, 8.47" },
  { text: "No discutas más sobre cómo debe ser un hombre bueno: sélo.", author: "Marco Aurelio", source: "Meditaciones, 10.16" },
  { text: "Muchas veces me asombró que cada uno se quiera más a sí mismo que a los demás y, sin embargo, valore menos su propia opinión sobre sí que la de los otros.", author: "Marco Aurelio", source: "Meditaciones, 12.4" },
  // Epicteto
  { text: "De las cosas, unas dependen de nosotros y otras no.", author: "Epicteto", source: "Enquiridión, 1.1" },
  { text: "Lo que perturba a los hombres no son las cosas, sino las opiniones sobre las cosas.", author: "Epicteto", source: "Enquiridión, 5" },
  { text: "No pretendas que lo que sucede suceda como quieres, sino quiere que suceda como sucede, y vivirás sereno.", author: "Epicteto", source: "Enquiridión, 8" },
  { text: "Si quieres progresar, acepta parecer necio e ignorante en lo externo.", author: "Epicteto", source: "Enquiridión, 13" },
  { text: "Recuerda que no te ofende quien te insulta o te golpea, sino tu opinión de que te ofende.", author: "Epicteto", source: "Enquiridión, 20" },
  { text: "Calla la mayor parte del tiempo, o di solo lo necesario, y en pocas palabras.", author: "Epicteto", source: "Enquiridión, 33.2" },
  { text: "¿Hasta cuándo vas a esperar para considerarte digno de lo mejor?", author: "Epicteto", source: "Enquiridión, 51.1" },
  { text: "Nada grande se produce de golpe, ni siquiera la uva o el higo.", author: "Epicteto", source: "Disertaciones, 1.15.7" },
];

const TZ = "America/Montevideo";

/** Día (YYYY-MM-DD) y hora en Montevideo de un instante. */
export function montevideoNow(at: Date = new Date()): { day: string; hour: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** Tramo de 6 horas (00, 06, 12, 18) contado desde 1970: cambia la frase. */
export function quoteSlot(day: string, hour: number): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000) * 4 + Math.floor(hour / 6);
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/** La frase de un tramo: salta por la lista con un paso coprimo, así no salen seguidas las del mismo autor. */
export function quoteFor(slot: number): Quote {
  const n = QUOTES.length;
  let step = 17;
  while (gcd(step, n) !== 1) step++;
  return QUOTES[(((slot * step) % n) + n) % n];
}

/** Milisegundos hasta el próximo cambio de tramo (hora en punto múltiplo de 6, en Montevideo). */
export function msToNextSlot(at: Date = new Date()): number {
  const { hour } = montevideoNow(at);
  const next = (Math.floor(hour / 6) + 1) * 6;
  const minutes = at.getUTCMinutes();
  const seconds = at.getUTCSeconds();
  return ((next - hour) * 3600 - minutes * 60 - seconds) * 1000 - at.getUTCMilliseconds() + 500;
}
