"use client";

import {
  Baby, Barbell, Bathtub, Bed, Bicycle, BookOpen, Brain, Briefcase, Camera, CigaretteSlash, Circle,
  Code, Coffee, Cookie, DeviceMobileSlash, Dog, Drop, FirstAid, Flame, Footprints, ForkKnife,
  GameController, GraduationCap, Guitar, HandHeart, Heart, House, Leaf, Lightbulb, Moon, Mountains,
  MusicNote, Notebook, PaintBrush, PersonSimpleRun, PersonSimpleWalk, Pill, Plant, Prohibit, Smiley,
  Snowflake, Sparkle, Sun, Target, Television, Tooth, Translate, Tree, Users, Wallet, Wine,
  type Icon,
} from "@phosphor-icons/react";
import { tone } from "./palette";
import { ToneSquare } from "@/components/ui";

/** Íconos elegibles para categorías. La clave es lo que se guarda en la base. */
export const HABIT_ICONS: Record<string, Icon> = {
  Prohibit, CigaretteSlash, DeviceMobileSlash, Wine,
  PersonSimpleRun, PersonSimpleWalk, Barbell, Bicycle, Footprints, Mountains,
  FirstAid, Heart, Pill, Tooth, Drop, Snowflake, Bathtub, Bed,
  ForkKnife, Coffee, Cookie,
  Moon, Sun, Brain, Sparkle, Smiley, Leaf, Plant, Tree,
  BookOpen, Notebook, GraduationCap, Translate, Lightbulb, Code,
  Briefcase, Target, Wallet, House, Users, HandHeart, Baby, Dog,
  MusicNote, Guitar, PaintBrush, Camera, GameController, Television, Flame,
  Circle,
};

export function HabitIcon({ name, ...props }: { name: string } & React.ComponentProps<Icon>) {
  const C = HABIT_ICONS[name] ?? Circle;
  return <C {...props} />;
}

/**
 * El ícono de un hábito (o de una categoría de hábitos) junto al nombre: siempre el
 * mismo diseño en toda la app, el de la lista Hoy (cuadrado lleno del color con el
 * ícono en blanco). `size` en px, o `className` para tamaños que cambian con la pantalla.
 */
export function HabitAvatar({
  icon,
  color,
  size,
  className,
}: {
  icon: string;
  color: string;
  size?: number;
  className?: string;
}) {
  const px = size ?? 36;
  return (
    <ToneSquare solid size={className ? undefined : px} className={className} style={tone(color)}>
      <HabitIcon name={icon} size={className ? 17 : Math.round(px * 0.53)} weight="fill" aria-hidden />
    </ToneSquare>
  );
}
