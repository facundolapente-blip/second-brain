/**
 * Política de privacidad pública (sin sesión): Meta la pide para publicar la app
 * de WhatsApp del bot. El proxy deja pasar `/privacidad`.
 */
export const metadata = { title: "Política de privacidad · Second Brain" };

export default function Privacidad() {
  return (
    <main className="mx-auto grid max-w-2xl gap-5 px-4 py-12 text-[15px] leading-relaxed lg:py-20">
      <p className="kicker">Second Brain</p>
      <h1 className="display text-[34px]">Política de privacidad</h1>
      <p className="text-muted">Última actualización: 19 de octubre de 2026.</p>
      <p>
        Second Brain es una aplicación personal de una sola persona (su dueño). No tiene usuarios públicos, no vende datos y no los
        comparte con terceros.
      </p>
      <h2 className="text-[18px] font-semibold">Qué datos se guardan</h2>
      <p>
        Hábitos, entradas de diario, movimientos de dinero, tareas y planes que carga el dueño de la app. Si se usa el bot de
        WhatsApp, se procesan los mensajes que el dueño le manda desde su propio número para registrar gastos, tareas o notas. Los
        mensajes de cualquier otro número se descartan sin guardarse.
      </p>
      <h2 className="text-[18px] font-semibold">Dónde se guardan</h2>
      <p>
        En una base de datos privada (Neon) y en el alojamiento de la app (Vercel), protegidos con contraseña. Los mensajes de WhatsApp
        pasan por la plataforma de WhatsApp Business de Meta, sujeta a sus propias políticas.
      </p>
      <h2 className="text-[18px] font-semibold">Borrado</h2>
      <p>
        El dueño puede borrar cualquier dato desde la app en cualquier momento. Si le escribiste al bot desde otro número, ese
        mensaje no se guardó.
      </p>
    </main>
  );
}
