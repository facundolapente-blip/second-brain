"use client";

import { useOnNew } from "@/components/nav-add";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CaretRight, Plus } from "@phosphor-icons/react";
import { deleteCategory, saveCategory } from "@/lib/habit-actions";
import { HABIT_ICONS, HabitAvatar, HabitIcon } from "@/lib/habit-icons";
import { PALETTE, tone } from "@/lib/palette";
import type { CategoryDTO } from "@/lib/habits";
import { PageHeader } from "@/components/page-header";
import { Button, cx, Field, Input, Sheet, type SheetHandle } from "@/components/ui";
import { HabitsTabs } from "../habits-nav";

type Draft = { id?: string; name: string; icon: string; color: string };

export function CategoriesView({ categories }: { categories: CategoryDTO[] }) {
  const sheet = useRef<SheetHandle>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", icon: "Circle", color: "blue" });
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(saveCategory, null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state?.ok) sheet.current?.close();
  }, [state]);

  function open(d: Draft) {
    setDraft(d);
    setFormKey((k) => k + 1);
    sheet.current?.open();
  }
  const create = () => open({ name: "", icon: "Sparkle", color: "blue" });
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

      <main className="mx-auto max-w-3xl px-4 pt-4 lg:max-w-6xl lg:px-10 lg:pt-6">
        <ul className="grid grid-cols-2 border-t border-l border-line sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 lg:border-0">
          {categories.map((c, i) => (
            <li
              key={c.id}
              className="rise border-r border-b border-line lg:overflow-hidden lg:rounded-2xl lg:border lg:border-[var(--card-ring)] lg:bg-surface lg:shadow-[var(--card-shadow)]"
              style={{ "--i": i } as React.CSSProperties}
            >
              <button
                type="button"
                onClick={() => open({ id: c.id, name: c.name, icon: c.icon, color: c.color })}
                style={tone(c.color)}
                className="group flex h-full w-full flex-col items-start gap-8 p-4 text-left transition-colors hover:bg-surface-2 lg:min-h-44 lg:justify-between lg:p-6"
              >
                <HabitAvatar icon={c.icon} color={c.color} size={42} />
                <span className="flex w-full items-end justify-between gap-2">
                  <span className="grid gap-0.5">
                    <span className="display text-[21px]">{c.name}</span>
                    <span className="kicker">
                      {c.habitCount === 0 ? "Sin hábitos" : c.habitCount === 1 ? "1 hábito" : `${c.habitCount} hábitos`}
                    </span>
                  </span>
                  <CaretRight size={16} className="text-faint transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            </li>
          ))}
          <li className="hidden lg:block">
            <button
              type="button"
              onClick={create}
              className="flex h-full min-h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-[14px] text-muted transition-colors hover:border-fg/40 hover:bg-surface-2 hover:text-fg"
            >
              <Plus size={20} />
              Nueva categoría
            </button>
          </li>
        </ul>
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
                    "size-8 rounded-full bg-tone-solid transition-transform active:scale-90",
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

          {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}

          <div className="grid gap-2">
            <Button type="submit" variant="accent" disabled={pending}>
              {pending ? "Guardando..." : draft.id ? "Guardar cambios" : "Crear categoría"}
            </Button>
            {draft.id && (
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  if (confirm(`¿Eliminar "${draft.name}"? Sus hábitos quedan sin categoría.`)) {
                    const id = draft.id!;
                    startTransition(() => deleteCategory(id));
                    sheet.current?.close();
                  }
                }}
              >
                Eliminar categoría
              </Button>
            )}
          </div>
        </form>
      </Sheet>
    </>
  );
}
