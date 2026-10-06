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
    <form onSubmit={onSubmit} className="grid gap-4">
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
        <p role="alert" className="border-l-4 border-danger pl-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Un segundo..." : mode === "in" ? "Entrar" : "Crear contraseña"}
      </Button>
    </form>
  );
}

const MODULES = ["Hábitos", "Journal", "Gastos", "Plan semanal"];

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm border border-rule bg-surface shadow-[6px_6px_0_rgba(var(--shadow-tint),0.18)]">
        <header className="grid gap-4 border-b border-rule p-5">
          <div className="flex items-center justify-between">
            <span className="relative inline-flex size-9 items-center justify-center bg-ink text-[15px] font-extrabold text-on-ink">
              F
              <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2.5 bg-accent" />
            </span>
            <span className="label-mono text-muted">Acceso</span>
          </div>
          <h1 className="display text-[38px] uppercase">
            Second
            <br />
            Brain
          </h1>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-muted" aria-label="Módulos">
            {MODULES.map((m, i) => (
              <li key={m} className="flex gap-2">
                <span className="text-accent-fg">0{i + 1}</span>
                {m}
              </li>
            ))}
          </ul>
        </header>
        <div className="p-5">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
