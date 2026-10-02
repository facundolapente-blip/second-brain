"use client";

import { ErrorState } from "@/components/error-state";

export default function JournalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState title="Journal" error={error} retry={retry} back={{ href: "/journal", label: "Ir a las entradas" }} />;
}
