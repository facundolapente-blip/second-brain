import { JournalNav } from "./journal-nav";

// Las fuentes (Geist) las carga el layout raíz.
export default function JournalLayout({ children }: LayoutProps<"/journal">) {
  return (
    <div data-module="journal" className="min-h-dvh pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-12">
      {children}
      <JournalNav />
    </div>
  );
}
