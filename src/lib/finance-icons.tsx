"use client";

import {
  Airplane, ArrowsLeftRight, Baby, Bank, Barbell, BeerStein, BookOpen, Briefcase, Bus, Car, ChartLineUp,
  Coffee, Coins, Confetti, CreditCard, DeviceMobile, FilmSlate, FirstAid, ForkKnife, GameController,
  GasPump, Gift, GraduationCap, HandCoins, Hamburger, Heartbeat, House, Laptop, Lightning, Money,
  MusicNotes, PawPrint, PiggyBank, Pill, Pizza, Question, Receipt, Repeat, Scales, Scissors, ShoppingBag,
  ShoppingCart, Sparkle, Storefront, Suitcase, Tag, Taxi, Television, TShirt, Wallet, WifiHigh, Wine, Wrench,
  type Icon,
} from "@phosphor-icons/react";

/** Íconos elegibles para categorías y cuentas. La clave es lo que se guarda en la base. */
export const FINANCE_ICONS: Record<string, Icon> = {
  ShoppingCart, Storefront, ForkKnife, Hamburger, Pizza, Coffee, BeerStein, Wine,
  Confetti, FilmSlate, MusicNotes, GameController, Television,
  House, Lightning, WifiHigh, Wrench, DeviceMobile, Laptop,
  Heartbeat, FirstAid, Pill, Scissors, Barbell, Sparkle,
  Bus, Car, Taxi, GasPump, Airplane, Suitcase,
  ShoppingBag, TShirt, Gift, Repeat, Receipt,
  GraduationCap, BookOpen, Baby, PawPrint,
  Briefcase, Money, Coins, HandCoins, PiggyBank, ChartLineUp, Bank, CreditCard, Wallet,
  Scales, Tag,
};

export function FinanceIcon({ name, ...props }: { name: string } & React.ComponentProps<Icon>) {
  const C = FINANCE_ICONS[name] ?? Tag;
  return <C {...props} />;
}

export { ArrowsLeftRight as TransferIcon, Question as UncategorizedIcon };
