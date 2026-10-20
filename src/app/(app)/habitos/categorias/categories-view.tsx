"use client";

import { safeForm, useSafeTransition } from "@/components/safe-action";
import { useOnNew } from "@/components/nav-add";
import { useActionState, useEffect, useRef, useState } from "react";
import { CaretRight, Plus, SquaresFour } from "@phosphor-icons/react";
import { deleteCategory, saveCategory } from "@/lib/offline/habit";
import { HABIT_ICONS, HabitAvatar, HabitIcon } from "@/lib/habit-icons";
import { PALETTE, tone } from "@/lib/palette";
import type { CategoryDTO } from "@/lib/habits";
import { PageHeader } from "@/components/page-header";
import { Button, ConfirmButton, cx, Field, Input, Sheet, type SheetHandle } from "@/components/ui";
import { HabitsTabs } from "../habits-nav";
import { TintedCard } from "@/components/tinted-card";
import "../habits.css";

type Draft = { id?: string; name: string; icon: string; color: string };

export function CategoriesView({ categories }: { categories: CategoryDTO[] }) {
  const sheet = useRef<SheetHandle>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", icon: "Circle", color: "blue" });
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(safeForm(saveCategory), null);
  const [, startTransition] = useSafeTransition();

  useEffect(() => {
    if (state?.ok) sheet.current?.close();
  }, [state]);

  function open(d: Draft) {
    setDraft(d);
    setFormKey((k) => k + 1);
    sheet.current?.open();
  }
  const create = () => open({ name: "", icon: "Sparkle", color: "blue" });
  const habitTotal = categories.reduce((a, c) => a + c.habitCount, 0);
  useOnNew(create);

  return (
    <>
      <PageHeader
        title="Categorías"
        wide
        tabs={<HabitsTabs />}
        actions={
          <Button variant="accent" size="sm" className="max-lg:hidden" onClick={create}>
            <Plus size={16} weight="bold" /> Nueva categoría
          </Button>
        }
      />

      <main className="mx-auto max-w-3xl px-4 pt-3 lg:max-w-6xl lg:px-10 lg:pt-6">
        <TintedCard
          icon={SquaresFour}
          title="Tus categorías"
          meta={`${categories.length} ${categories.length === 1 ? "categoría" : "categorías"} · ${habitTotal} ${habitTotal === 1 ? "hábito" : "hábitos"}`}
          action={
            <button type="button" className="tcard-pill press lg:hidden!" onClick={create}>
              <Plus size={13} weight="bold" aria-hidden /> Nueva
            </button>
          }
          bodyClassName="p-0!"
        >
          {categories.length === 0 ? (
            <div className="grid justify-items-start gap-3 px-5 py-8">
              <p className="text-[15px] font-medium">Todavía no hay categorías</p>
              <p className="max-w-[46ch] text-[14px] leading-relaxed text-muted">
                Agrupan los hábitos (Salud, Trabajo, Noche...) y les dan el color y el ícono.
              </p>
              <Button variant="accent" size="sm" onClick={create}>
                <Plus size={16} weight="bold" /> Crear categoría
              </Button>
            </div>
          ) : (
            // Celdas separadas por líneas finas (sin tarjetas dentro de la tarjeta); la última fila
            // sin línea abajo y la última columna sin línea a la derecha.
            <ul className="cat-grid -mb-px grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {categories.map((c) => (
                <li key={c.id} className="border-line">
                  <button
                    type="button"
                    onClick={() => open({ id: c.id, name: c.name, icon: c.icon, color: c.color })}
                    style={tone(c.color)}
                    className="group flex h-full w-full flex-col items-start gap-7 p-4 text-left transition-colors hover:bg-surface-2 lg:min-h-40 lg:justify-between lg:p-5"
                  >
                    <HabitAvatar icon={c.icon} color={c.color} size={42} />
                    <span className="flex w-full items-end justify-between gap-2">
                      <span className="grid min-w-0 gap-0.5">
                        <span className="display text-[19px] break-words lg:text-[21px]">{c.name}</span>
                        <span className="kicker">
                          {c.habitCount === 0 ? "Sin hábitos" : c.habitCount === 1 ? "1 hábito" : `${c.habitCount} hábitos`}
                        </span>
                      </span>
                      <CaretRight size={16} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TintedCard>
      </main>

      <Sheet ref={sheet} title={draft.id ? "Editar categoría" : "Nueva categoría"}>
        <form key={formKey} action={action} className="grid gap-5">
          {draft.id && <input type="hidden" name="id" value={draft.id} />}
          <input type="hidden" name="icon" value={draft.icon} />
          <input type="hidden" name="color" value={draft.color} />

          <div className="flex items-end gap-3">
            <HabitAvatar icon={draft.icon} color={draft.color} size={40} />
            <Field label="Nombre" className="flex-1">
              <Input
                name="name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
                maxLength={40}
                placeholder="Deporte, Lectura..."
              />
            </Field>
          </div>

          <div className="grid gap-2">
            <span className="kicker">Color</span>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDraft({ ...draft, color: p })}
                  aria-label={p}
                  style={tone(p)}
                  className={cx(
                    "chip-solid size-8 rounded-full transition-transform active:scale-90",
                    draft.color === p && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
                  )}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <span className="kicker">Ícono</span>
            <div className="grid grid-cols-8 gap-1.5">
              {Object.keys(HABIT_ICONS).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setDraft({ ...draft, icon: name })}
                  aria-label={name}
                  style={tone(draft.color)}
                  className={cx(
                    "inline-flex aspect-square items-center justify-center rounded-[6px] transition-colors",
                    draft.icon === name ? "bg-tone text-tone-fg ring-1 ring-[var(--tone-solid)] ring-inset" : "text-muted hover:bg-surface-2",
                  )}
                >
                  <HabitIcon name={name} size={19} weight={draft.icon === name ? "fill" : "regular"} />
                </button>
              ))}
            </div>
          </div>

          {state && !state.ok && <p className="reveal text-sm text-danger">{state.error}</p>}

          <div className="grid gap-2">
            <Button type="submit" variant="accent" disabled={pending}>
              {pending ? "Guardando..." : draft.id ? "Guardar cambios" : "Crear categoría"}
            </Button>
            {draft.id && (
              <ConfirmButton
                undo="Categoría borrada"
                confirmLabel="Tocá de nuevo: sus hábitos quedan sin categoría"
                onConfirm={() => {
                  const id = draft.id!;
                  startTransition(() => deleteCategory(id));
                  sheet.current?.close();
                }}
              >
                Eliminar categoría
              </ConfirmButton>
            )}
          </div>
        </form>
      </Sheet>
    </>
  );
}
