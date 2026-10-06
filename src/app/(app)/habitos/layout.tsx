import { HabitsNav } from "./habits-nav";

export default function HabitsLayout({ children }: LayoutProps<"/habitos">) {
  return (
    <div className="min-h-dvh pb-[calc(160px+env(safe-area-inset-bottom))] lg:pb-12">
      {children}
      <HabitsNav />
    </div>
  );
}
