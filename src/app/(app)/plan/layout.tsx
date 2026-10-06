import { PlanNav } from "./plan-nav";

export default function PlanLayout({ children }: LayoutProps<"/plan">) {
  return (
    <div data-module="plan" className="min-h-dvh pb-[calc(76px+env(safe-area-inset-bottom))] lg:pb-12">
      {children}
      <PlanNav />
    </div>
  );
}
