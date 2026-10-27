"use client";

import type { ComponentProps } from "react";
import {
  BookOpen,
  CalendarBlank,
  CalendarCheck,
  ChartBar,
  ClockCounterClockwise,
  Fire,
  MagnifyingGlass,
  Notebook,
  PenNib,
  Smiley,
  Star,
  TextAa,
  Trophy,
} from "@phosphor-icons/react";
import { StatTile, TintedCard } from "@/components/tinted-card";

/**
 * TintedCard y StatTile para las páginas de servidor del Journal: el ícono va por
 * nombre (un componente no puede pasar del servidor al cliente) y `tinted-card.tsx`
 * usa `cx` de un módulo de cliente, así que tiene que dibujarse del lado del cliente.
 */
const ICONS = {
  book: BookOpen,
  calendar: CalendarBlank,
  "calendar-check": CalendarCheck,
  chart: ChartBar,
  fire: Fire,
  history: ClockCounterClockwise,
  search: MagnifyingGlass,
  notebook: Notebook,
  pen: PenNib,
  smiley: Smiley,
  star: Star,
  text: TextAa,
  trophy: Trophy,
} as const;

export type JournalIcon = keyof typeof ICONS;

export function JCard({ icon, ...rest }: Omit<ComponentProps<typeof TintedCard>, "icon"> & { icon: JournalIcon }) {
  return <TintedCard icon={ICONS[icon]} {...rest} />;
}

export function JStat({ icon, ...rest }: Omit<ComponentProps<typeof StatTile>, "icon"> & { icon: JournalIcon }) {
  return <StatTile icon={ICONS[icon]} {...rest} />;
}
