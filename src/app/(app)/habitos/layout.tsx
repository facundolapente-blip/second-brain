import { HabitsNav } from "./habits-nav";

export default function HabitsLayout({ children }: LayoutProps<"/habitos">) {
  return (
    <div data-module="habitos" className="min-h-dvh pb-[calc(156px+env(safe-area-inset-bottom))] lg:pb-12">
      {children}
      <HabitsNav />
    </div>
  );
}
