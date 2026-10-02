"use client";

import {
  Baby, Barbell, Bathtub, Bed, Bicycle, BookOpen, Brain, Briefcase, Camera, CigaretteSlash, Circle,
  Code, Coffee, Cookie, DeviceMobileSlash, Dog, Drop, FirstAid, Flame, Footprints, ForkKnife,
  GameController, GraduationCap, Guitar, HandHeart, Heart, House, Leaf, Lightbulb, Moon, Mountains,
  MusicNote, Notebook, PaintBrush, PersonSimpleRun, PersonSimpleWalk, Pill, Plant, Prohibit, Smiley,
  Snowflake, Sparkle, Sun, Target, Television, Tooth, Translate, Tree, Users, Wallet, Wine,
  type Icon,
} from "@phosphor-icons/react";

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
