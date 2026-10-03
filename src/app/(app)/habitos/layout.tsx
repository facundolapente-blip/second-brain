import { HabitsNav } from "./habits-nav";

export default function HabitsLayout({ children }: LayoutProps<"/habitos">) {
  return (
    <div className="mod-habitos min-h-dvh pb-[calc(96px+env(safe-area-inset-bottom))] lg:pb-12">
      {children}
      <HabitsNav />
    </div>
  );
}
