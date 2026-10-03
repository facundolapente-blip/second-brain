import { PlanNav } from "./plan-nav";

export default function PlanLayout({ children }: LayoutProps<"/plan">) {
  return (
    <div className="mod-plan min-h-dvh pb-[calc(96px+env(safe-area-inset-bottom))] lg:pb-12">
      {children}
      <PlanNav />
    </div>
  );
}
