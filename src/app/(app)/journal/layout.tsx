import { Newsreader } from "next/font/google";
import { JournalNav } from "./journal-nav";

// Serif para leer y escribir. Solo la carga este módulo (token --font-serif en globals.css).
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

export default function JournalLayout({ children }: LayoutProps<"/journal">) {
  return (
    <div className={`${newsreader.variable} min-h-dvh pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-12`}>
      {children}
      <JournalNav />
    </div>
  );
}
