"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { Button, Field, Input, Segmented } from "@/components/ui";
import { BrandMark } from "@/components/shell";

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
      setError(mode === "in" ? "Mail o contraseña incorrectos." : (res.error.message ?? "No se pudo crear la cuenta."));
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
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="accent" disabled={pending} className="mt-1">
        {pending ? "Un segundo…" : mode === "in" ? "Entrar" : "Crear contraseña"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      {/* Luz de farol detrás de la tarjeta. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-[34rem] -translate-x-1/2 -translate-y-[60%] rounded-full bg-accent opacity-[0.09] blur-[120px]"
      />
      <div className="relative w-full max-w-sm rounded-[30px] border border-line bg-surface/40 p-1.5 shadow-[0_40px_80px_-40px_rgba(var(--shadow-tint),0.6)]">
        <div className="rounded-[24px] bg-surface p-6 shadow-[inset_0_1px_0_var(--edge)] sm:p-7">
          <div className="mb-7 grid justify-items-start gap-4">
            <BrandMark size={44} />
            <div className="grid gap-1">
              <h1 className="display text-[28px] leading-tight font-semibold">Second Brain</h1>
              <p className="text-sm text-muted">Hábitos, journal, gastos y plan en un solo lugar.</p>
            </div>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
