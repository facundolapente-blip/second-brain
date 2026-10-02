# CLAUDE.md

@AGENTS.md

## Qué es

App personal de Facu ("Second Brain") que junta cuatro pilares: **hábitos**, **journal**, **gastos** y **plan semanal** (reemplaza a Notion; es el más grande y va último). Se construye **un módulo a la vez**. UI en español (UY), tiene que andar bien en el celular.

Estado: **Hábitos** hecho (calcado de HabitNow, la app que usaba). Journal, Gastos y Plan figuran como "Pronto" en el menú. Las tablas de Journal y Gastos ya están en el schema pero sin UI.

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

## Diseño

Monocromo cálido estilo documento, tokens en `globals.css` (claro/oscuro por `prefers-color-scheme`). Un solo acento: azul petróleo (`--accent`). Color solo en pasteles de categoría (`src/lib/palette.ts`) y en los estados de día (`--st-*`). Radios 6px controles / 12-14px superficies. Sin em-dashes en textos visibles. Hojas inferiores con `<dialog>` (`Sheet` en `components/ui.tsx`).
