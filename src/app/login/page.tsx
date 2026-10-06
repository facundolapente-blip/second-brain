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
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Un segundo..." : mode === "in" ? "Entrar" : "Crear contraseña"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mod-plan grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 grid justify-items-center gap-4 text-center">
          <BrandMark size={64} />
          <div className="grid gap-1">
            <h1 className="text-[32px] leading-none font-black tracking-[-0.02em]">Second Brain</h1>
            <p className="text-[15px] font-semibold text-muted">Hábitos, journal, gastos y tu semana.</p>
          </div>
        </div>
        <div className="card rounded-[28px] p-5">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
