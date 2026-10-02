# CLAUDE.md

@AGENTS.md

## Qué es

App personal de Facu ("Second Brain") que junta cuatro pilares: **hábitos**, **journal**, **gastos** y **plan semanal** (reemplaza a Notion; es el más grande y va último). Se construye **un módulo a la vez**. UI en español (UY), tiene que andar bien en el celular.

Estado: **Hábitos** hecho (calcado de HabitNow, la app que usaba) y **Journal** hecho (primera versión, distribución tomada de la app de diario que usaba). **Gastos** con primera versión (funciones de la app de gastos que usaba, diseño propio). Plan figura como "Pronto" en el menú.

## Comandos

```bash
npx prisma dev --name sb-local --detach   # Postgres local sin Docker (PGlite)
npm run dev                               # :3000
npx tsc --noEmit && npx eslint src        # no hay tests
# migración nueva tras tocar el schema (PGlite no tiene base sombra, así que migrate dev no anda):
#   mkdir prisma/migrations/<fecha>_<nombre>
#   npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<...>/migration.sql
#   npx prisma migrate deploy   (frenar npm run dev antes de prisma generate: en Windows bloquea el motor)
node --env-file=.env scripts/seed-demo.ts # hábitos de ejemplo con historial inventado (solo local)
node --env-file=.env scripts/seed-journal-demo.ts # entradas de journal de ejemplo (solo localhost)
node --env-file=.env scripts/seed-gastos-demo.ts  # cuentas y movimientos de ejemplo (solo localhost)
```

- **Nunca `prisma db push`**: el schema se cambia con migraciones.
- La base local es PGlite: **una sola sesión compartida**. Por eso `DATABASE_URL` lleva `connection_limit=1&pgbouncer=true` (sin eso, error "prepared statement s0 already exists"). Tampoco admite varias bases: `CREATE DATABASE` no aísla nada.
- `LOCAL_SIN_LOGIN` en `.env` entra sin contraseña con `npm run dev` (nunca en producción).

## Stack

Next.js 16 (App Router, sin `cacheComponents`: páginas `force-dynamic` + `revalidatePath`), React 19, Prisma 6 sobre Postgres (Neon en prod, pendiente), Tailwind v4, Better Auth (mail + contraseña, lista blanca `ALLOWED_EMAILS`), íconos Phosphor (no lucide).

**Auth**: `src/proxy.ts` solo mira la cookie; la validación real está en `(app)/layout.tsx` y en `exigirSesion()` al principio de cada server action. App de una sola persona: los datos **no** llevan `userId`.

## Hábitos

- Reglas puras en `src/lib/habit-logic.ts` (servidor y cliente): estado de un día, racha, mejor racha, % de cumplimiento. Frecuencias: `daily`, `weekdays` (días fijos), `weekly` (X veces por semana, semana de lunes a domingo).
- Un `HabitLog` por hábito y día con `status` `done|failed|skipped` y `value` (cantidad). Sin fila = sin marcar. En hábitos de cantidad, "hecho" es `value >= target`.
- Los días son strings `YYYY-MM-DD` en zona `America/Montevideo` (`src/lib/dates.ts`); en la base, columnas `@db.Date` leídas como medianoche UTC. Nunca usar hora local para calcular días.
- Marcas optimistas con `useHabitLogs` (`habit-ui.tsx`); la server action revalida `/habitos`.
- Tocar un día en la tarjeta rota: sin marcar → hecho → fallado → salteado. Hábitos de cantidad abren `DaySheet`.
- Cada día puede tener nota (`HabitLog.note`); un día con nota y sin marca queda con `status = "none"`.
- Detalle `/habitos/[id]?tab=calendario|estadisticas|editar`: calendario + notas, estadísticas (puntaje, racha, veces logrado, línea del mes, barras semana/mes/año, logrado/fallido, desafío de racha) y edición.
- **Pistas** (como HabitNow): `Habit.startDate` es el inicio de la pista actual; las cerradas están en `HabitTrack` con la configuración que tenían. Tarjeta, Hoy y racha usan la pista actual; el detalle elige pista actual / todas / una vieja (`trackStats`).
- Reglas calibradas con el backup real de HabitNow (`scripts/import-habitnow.ts`): los salteados no bajan la meta semanal, la primera semana se prorratea, la semana en curso entra al puntaje solo si se cumplió. El % de la tarjeta es el puntaje.
- Pendiente: reordenar a mano, recordatorios.

## Journal

- Distribución copiada de la app de diario de Facu (no el estilo): saludo con fecha y racha, tarjeta de recuerdo ("En este día" otros años, si no el mismo día otros meses, si no ayer; se cierra por hoy con la cookie `jr_recuerdo`), entradas como tarjetas agrupadas por año (día grande, mes chico, cara del ánimo, extracto de 3 líneas en serif). Barra inferior del celular: Calendario, botón grande de escribir al medio, Estadísticas. En escritorio, pestañas.
- Rutas: `/journal` (lista, búsqueda `?q=`, filtros `?etiqueta=` y `?animo=`, paginado `?n=`), `/journal/[id]` (editor), `/journal/calendario?mes=&dia=`, `/journal/estadisticas?mes=`.
- Escribir = server action `writeOnDay(fecha?, nueva?)`: abre la primera entrada de ese día o crea una y redirige. Las vacías no se listan, se borran al volver con la flecha (`discardIfEmpty`) y las abandonadas se limpian al crear otra (más de una hora). No borrar en el desmontaje: el modo estricto de React lo dispara al montar.
- Editor: estado local, autoguardado con debounce de 900 ms en fila (nunca dos guardados a la vez, siempre manda lo último), guarda también al ocultar la pestaña y al salir. `saveEntry` revalida `/journal` (layout); el editor ignora las props nuevas a propósito para no pisar lo que se está escribiendo.
- Ánimo 1 a 5 con caras Phosphor y colores de la paleta (`MOODS` en `src/lib/journal-logic.ts`). Etiquetas normalizadas en minúsculas sin `#`.
- Serif Newsreader cargada solo en `journal/layout.tsx` (token `--font-serif`). Reglas puras en `journal-logic.ts`, consultas en `journal.ts`, acciones en `journal-actions.ts`.
- Importador pendiente: `JournalEntry.source` + `externalId` (único juntos) para reimportar sin duplicar. La app de origen es **My Diary**; Facu va a pasar el export (sin fotos).
- Lo que confirmó Facu (2026-10-02): casi siempre 1 entrada por día, a veces 2 (por eso el + abre la del día y el editor tiene "Otra entrada para este día"); usa título y etiquetas; no quiere candado ni recordatorios; estadísticas se definen más adelante.
- La búsqueda es `ILIKE` (no ignora tildes).

## Gastos

- Funciones tomadas de la app de gastos que Facu usaba en el celular (no el diseño): varias cuentas cada una con su moneda, todo movimiento sale de una cuenta, transferencias entre cuentas (también UYU a USD con monto de destino distinto), vista por mes agrupada por día con netos, selector de cuentas multi-selección, "Sin clasificar", plantillas.
- Montos en la base: `Decimal(14,2)` siempre positivos; el signo lo da `kind` (`expense|income|transfer`). En el código todo viaja en **centavos enteros** (`toCents`, `centsToDecimalString`, `parseAmount` en `src/lib/finance-logic.ts`); nunca floats de pesos. El saldo no se guarda: saldo inicial + efectos (`effects()`), calculado con `groupBy` en `getAccounts()`.
- Transferencia: sale `amount` de `accountId`, entra `toAmount` en `toAccountId` (iguales si la moneda coincide). Vista desde las cuentas elegidas: entre dos elegidas de la misma moneda no mueve el neto; si solo una está elegida, es entrada o salida.
- No se convierte entre monedas: los totales van por moneda (`CurrencyTotals`), Informes elige una moneda a la vez.
- Selector de cuentas: cookie `gastos_cuentas` (ids separados por coma, sin cookie = todas), leída en `gastos/layout.tsx` y compartida por `SelectionProvider` (`gastos/selection.tsx`).
- `categoryId` null = "Sin clasificar". Borrar una categoría deja sus movimientos sin clasificar; una cuenta con movimientos no se borra (se archiva) y no cambia de moneda. Categorías de fábrica en `ensureCategories()` (`finance.ts`).
- Rutas: `/gastos?mes=YYYY-MM` (movimientos), `/gastos/cuentas`, `/gastos/categorias`, `/gastos/sin-clasificar`, `/gastos/plantillas`, `/gastos/informes?mes=`. Barra inferior del celular: Movimientos, Cuentas, Categorías, Informes (Sin clasificar y Plantillas se abren desde Movimientos); en escritorio, pestañas.
- Modelo listo pero sin proceso: `ScheduledTransaction` (orden permanente o programado; `frequency`, `interval`, `nextDate`; el movimiento generado lleva `scheduleId`). Importador: `Transaction.source` + `externalId` (únicos juntos), falta el formato del export de la app.
- Colores de gráficos en `gastos/gastos.css` (`--fin-in`, `--fin-out`), validados con la skill dataviz en claro y oscuro.
- `node --env-file=.env scripts/seed-gastos-demo.ts`: cuentas reales de Facu con movimientos inventados (solo localhost); ajusta saldos iniciales para que el saldo de hoy dé el de sus capturas.

## Diseño

Monocromo cálido estilo documento, tokens en `globals.css` (claro/oscuro por `prefers-color-scheme`). Un solo acento: azul petróleo (`--accent`). Color solo en pasteles de categoría (`src/lib/palette.ts`) y en los estados de día (`--st-*`). Radios 6px controles / 12-14px superficies. Sin em-dashes en textos visibles. Hojas inferiores con `<dialog>` (`Sheet` en `components/ui.tsx`).
