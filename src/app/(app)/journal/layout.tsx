import { JournalNav } from "./journal-nav";

// La serif (Newsreader) la carga el layout raíz: en Papel la usa toda la app.
export default function JournalLayout({ children }: LayoutProps<"/journal">) {
  return (
    <div className="min-h-dvh pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-12">
      {children}
      <JournalNav />
    </div>
  );
}
