"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { Button, Field, Input, Segmented } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    setPending(true);
    setError(null);
    const res =
      mode === "in"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name: email.split("@")[0] });
    setPending(false);
    if (res.error) {
      setError(
        mode === "in"
          ? "Mail o contraseña incorrectos."
          : (res.error.message ?? "No se pudo crear la cuenta."),
      );
      return;
    }
    const volver = params.get("volver");
    router.replace(volver?.startsWith("/") ? volver : "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "in", label: "Entrar" },
          { value: "up", label: "Primera vez" },
        ]}
      />
      <Field label="Mail">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Contraseña" hint={mode === "up" ? "Mínimo 8 caracteres." : undefined}>
        <Input
          name="password"
          type="password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          minLength={8}
          required
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Un segundo..." : mode === "in" ? "Entrar" : "Crear contraseña"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 grid gap-3 border-b border-fg/80 pb-6">
          <p className="kicker">Cuaderno de Facu</p>
          <h1 className="display text-[52px] leading-[0.95] italic">Second Brain</h1>
          <p className="prose-serif text-[17px] leading-snug text-muted">
            Hábitos, journal, gastos y la semana, en un mismo cuaderno.
          </p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
