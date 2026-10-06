"use client";

import { ErrorState } from "@/components/error-state";

export default function InicioError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState title="Inicio" error={error} retry={retry} back={{ href: "/habitos", label: "Ir a Hábitos" }} />;
}
