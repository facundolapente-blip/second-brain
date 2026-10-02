"use client";

import { ErrorState } from "@/components/error-state";

export default function GastosError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState title="Gastos" error={error} retry={retry} back={{ href: "/gastos", label: "Ir a movimientos" }} />;
}
