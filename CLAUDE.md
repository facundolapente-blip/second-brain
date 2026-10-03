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

## Producción

- App: https://second-brain-ochre-phi.vercel.app (Vercel, proyecto `second-brain`, región `gru1`). Repo privado: github.com/facundolapente-blip/second-brain.
- Base: Neon, proyecto `second-brain` (`dry-mode-32198909`, aws-sa-east-1). Conexiones y secreto en `.env.production.local` (fuera de git). Para correr algo contra producción: `set -a; . ./.env.production.local; set +a` (los importadores mejor con `DATABASE_URL="$DIRECT_URL"`).
- Variables en Vercel: `DATABASE_URL` (pooled), `DIRECT_URL`, `BETTER_AUTH_SECRET`, `ALLOWED_EMAILS`. `BETTER_AUTH_URL` no hace falta: `urlBase()` usa `VERCEL_PROJECT_PRODUCTION_URL`.
- Deploy: Vercel está conectado al repo, **cada push a `main` despliega solo** (el build aplica migraciones solo en producción, `scripts/build.mjs`). A mano: `npx vercel deploy --prod`.

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
- Importador de **My Diary**: `node --env-file=.env scripts/import-mydiary.ts <MyDiary_all_*.docx> [--drop-demo]`. Lee el .docx con fflate (fecha / vacío / título / cuerpo / "Powered by MyDiary" / guiones). `source = "mydiary"`, `externalId = fecha#n` contando desde la más vieja del día, así reimportar actualiza sin duplicar y no pisa ánimo ni etiquetas. El export no trae ánimo, etiquetas, hora ni fotos.
- Lo que confirmó Facu (2026-10-02): casi siempre 1 entrada por día, a veces 2 (por eso el + abre la del día y el editor tiene "Otra entrada para este día"); usa título y etiquetas; no quiere candado ni recordatorios; estadísticas se definen más adelante.
- La búsqueda es `ILIKE` (no ignora tildes).
- Interfaz (rediseño 2026-10): tarjeta con columna de fecha (día, mes, día de la semana) y palabras al pie; año pegado arriba en el celular; recuerdo con la entrada más cercana como cita. Editor de ~66 caracteres por línea, título que envuelve, estado "Guardando / Guardado / Sin guardar" con ícono. Calendario: día escrito sin ánimo en `accent-soft`. Estadísticas: cifra total protagonista, "Constancia" (años x meses, días escritos por mes), entradas por mes, días de la semana y la entrada más larga (`getStats` devuelve `perMonthDays`, `perWeekday`, `longest`, `firstDate`). Lo importado de My Diary no tiene ánimo: nada depende de que lo haya.

## Gastos

- Funciones tomadas de la app de gastos que Facu usaba en el celular (no el diseño): varias cuentas cada una con su moneda, todo movimiento sale de una cuenta, transferencias entre cuentas (también UYU a USD con monto de destino distinto), vista por mes agrupada por día con netos, selector de cuentas multi-selección, "Sin clasificar", plantillas.
- Montos en la base: `Decimal(14,2)` siempre positivos; el signo lo da `kind` (`expense|income|transfer`). En el código todo viaja en **centavos enteros** (`toCents`, `centsToDecimalString`, `parseAmount` en `src/lib/finance-logic.ts`); nunca floats de pesos. El saldo no se guarda: saldo inicial + efectos (`effects()`), calculado con `groupBy` en `getAccounts()`.
- Transferencia: sale `amount` de `accountId`, entra `toAmount` en `toAccountId` (iguales si la moneda coincide). Vista desde las cuentas elegidas: entre dos elegidas de la misma moneda no mueve el neto; si solo una está elegida, es entrada o salida.
- No se convierte entre monedas: los totales van por moneda (`CurrencyTotals`), Informes elige una moneda a la vez.
- Selector de cuentas: cookie `gastos_cuentas` (ids separados por coma, sin cookie = todas), leída en `gastos/layout.tsx` y compartida por `SelectionProvider` (`gastos/selection.tsx`).
- `categoryId` null = "Sin clasificar". Borrar una categoría deja sus movimientos sin clasificar; una cuenta con movimientos no se borra (se archiva) y no cambia de moneda. Categorías de fábrica en `ensureCategories()` (`finance.ts`).
- Rutas: `/gastos?mes=YYYY-MM` (movimientos), `/gastos/cuentas`, `/gastos/categorias`, `/gastos/sin-clasificar`, `/gastos/plantillas`, `/gastos/informes?mes=`. Barra inferior del celular: Movimientos, Cuentas, Categorías, Informes (Sin clasificar y Plantillas se abren desde Movimientos); en escritorio, pestañas.
- Modelo listo pero sin proceso: `ScheduledTransaction` (orden permanente o programado; `frequency`, `interval`, `nextDate`; el movimiento generado lleva `scheduleId`). Importador del CSV de la app: `node --env-file=.env scripts/import-gastos-csv.ts <archivo.csv> [--replace] [--sin-ajuste]` (DD-MM-AAAA, tipo 0 ingreso / 1 gasto, títulos con saltos de línea sin comillas, usa la categoría específica). El export **no trae transferencias**: el script calibra el saldo inicial de cada cuenta para que hoy dé el de la app (`SALDOS_HOY`). Ids estables (`source = "import:gastos-app"`), reimportar no duplica. Las transferencias van aparte: `node --env-file=.env scripts/import-gastos-transferencias.ts [data/transferencias.csv]` (`fecha;monto;desde;hacia;nota[;monto que llegó]`, transcriptas de las capturas; `data/` está en .gitignore porque son datos personales). Los dos importadores recalibran saldos con `scripts/gastos-saldos.ts`. Con las transferencias, el neto de Itau en set-2026 coincide con el de la app.
- Colores de gráficos en `gastos/gastos.css` (`--fin-in`, `--fin-out`), validados con la skill dataviz en claro y oscuro. En "Ritmo del mes" el mes anterior va en `--faint` como referencia (énfasis en uno, gris el otro; el validador marca croma bajo a propósito, la identidad la dan leyenda, relleno y tabla).
- Interfaz (rediseño 2026-10): montos de movimientos con signo explícito ("+"/"−"; el verde es refuerzo). Saldos con `Balance` (tinta, sin "+", negativo en rojo), nunca con `Amount`. Ingresos/gastos con flecha. Día pegado arriba en el celular. Transferencia sin nota se titula "Desde X a Y". Hoja de carga: monto con foco directo, Guardar pegado abajo, Ctrl/Cmd+Enter guarda, "Invertir" en transferencias; atajo N abre la hoja en Movimientos. Informes: en el mes en curso compara contra el anterior hasta el mismo día.
- `node --env-file=.env scripts/seed-gastos-demo.ts`: cuentas reales de Facu con movimientos inventados (solo localhost); ajusta saldos iniciales para que el saldo de hoy dé el de sus capturas.

## Plan semanal

- Reemplaza el "Plan Semanal" de Notion. Tres pantallas: **Semana** (`/plan?semana=YYYY-MM-DD`, bloques de lunes a domingo; en el celular tira de días + lista del día, en escritorio tablero de 7 columnas), **Tareas** (`/plan/tareas`, vistas guardadas como en Notion: Para hacer, Con deadline, Prioridades, Más chill, Programadas, Terminadas) y **Objetivos** (`/plan/objetivos`, objetivos con resultados clave, filtro por trimestre).
- Modelos: `PlanBlock` (día, `startTime`/`endTime` "HH:MM" opcionales, prioridad 0 a 4 fueguitos, `done`, `taskId`, `habitId`), `PlanTask` (status `backlog|todo|doing|done` = Programada / Sin empezar / En curso / Terminado, deadline, progreso/meta, `scheduled` = Agendada), `PlanObjective` + `PlanKeyResult` (kind activity/habit, status todo/doing/done/closed, `quarters`), `PlanCategory`.
- **Vínculo con Hábitos**: un bloque con `habitId` marca el hábito como hecho ese día al tildarlo (`syncHabit` en `plan-actions.ts`); al destildarlo solo borra la marca si era "hecho" (no pisa fallados ni salteados). El formulario sugiere vincular si el nombre coincide con un hábito.
- "Copiar a la semana que viene" duplica los bloques (sin el hecho). "Agendar en la semana" desde una tarea abre un bloque con la tarea vinculada.
- Un bloque llamado "Libre" se ve tenue y no cuenta en "N de M hechos".
- Importador: `node --env-file=.env scripts/import-notion-plan.ts <export.zip>` (export Markdown & CSV de Notion; usa los CSV `_all` de Daily Planning, Para hacer y Resultados Clave; fechas "28 de septiembre de 2026 9:00 (GMT-3) → 12:00"; vincula bloques con hábitos y tareas del mismo nombre; ids estables, no duplica).

## Diseño

Monocromo cálido estilo documento, tokens en `globals.css` (claro/oscuro por `prefers-color-scheme`). Un solo acento: azul petróleo (`--accent`). Color solo en pasteles de categoría (`src/lib/palette.ts`) y en los estados de día (`--st-*`). Radios 6px controles / 12-14px superficies. Sin em-dashes en textos visibles. Hojas inferiores con `<dialog>` (`Sheet` en `components/ui.tsx`).

- Texto sobre `bg-accent` siempre `text-on-accent` (blanco en claro, tinta en oscuro): `text-white` sobre el acento claro del modo oscuro no llega a AA. `--muted` es texto secundario AA; `--faint` solo para placeholders, separadores y lo decorativo.
- Foco visible con el acento (`:focus-visible` global). Áreas táctiles de 44px: `IconButton` agranda su área con un pseudo-elemento sin cambiar el tamaño visible.
- Utilidades: `.lift` (sombra teñida para lo que flota), `.skeleton` (carga), `.prose-serif` (lectura larga en Newsreader con `text-wrap: pretty` y guiones). Ojo: `@theme inline` no publica `--font-serif` como variable CSS; en CSS propio usar `var(--font-newsreader)`.
- Borrar con `ConfirmButton` (dos toques, vuelve solo a los 5 s), nunca `window.confirm`.
- Cada módulo tiene `loading.tsx` con esqueletos de la forma real (`components/skeleton.tsx`) y `error.tsx` con `ErrorState` (en Next 16 la prop es `retry`, no `reset`).
- Gráficos: un solo eje, leyenda con 2+ series, etiqueta directa solo donde importa, tooltip con puntero y teclado, y siempre "Ver como tabla". Rampas secuenciales con `color-mix` del acento sobre la superficie (se adaptan solas al modo oscuro).
