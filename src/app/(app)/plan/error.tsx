"use client";

import { ErrorState } from "@/components/error-state";

export default function PlanError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState title="Plan semanal" error={error} retry={retry} back={{ href: "/plan", label: "Ir a la semana" }} />;
}
