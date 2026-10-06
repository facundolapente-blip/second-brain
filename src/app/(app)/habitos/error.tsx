"use client";

import { ErrorState } from "@/components/error-state";

export default function HabitosError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState title="Hábitos" error={error} retry={retry} back={{ href: "/habitos", label: "Ir a Hoy" }} />;
}
