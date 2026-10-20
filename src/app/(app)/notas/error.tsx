"use client";

import { ErrorState } from "@/components/error-state";

export default function NotasError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState title="Notas" error={error} retry={retry} back={{ href: "/notas", label: "Ir a las notas" }} />;
}
