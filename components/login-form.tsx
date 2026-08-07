"use client";

import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { useActionState, useState } from "react";

import { loginAction, type AuthState } from "@/app/actions/auth";
import panelPlusLogo from "@/assets/nuevo_logo.png";
import { SubmitButton } from "@/components/submit-button";

const initialState: AuthState = {};

export function LoginForm() {
  const [role, setRole] = useState<"administrador" | "vendedor">("administrador");
  const [state, action] = useActionState(loginAction, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section className="w-full max-w-md">
        <div className="mb-10">
          <Image src={panelPlusLogo} alt="PanelPlus+" priority className="h-auto w-72 max-w-full" />
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            PanelPlus+ · Centro de operaciones
          </p>
        </div>

        <p className="text-sm font-semibold text-primary">Bienvenido</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Inicia sesión en tu cuenta</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Accede con las credenciales asignadas a tu perfil operativo.
        </p>

        <div className="mt-8 flex rounded-xl bg-secondary p-1" aria-label="Tipo de perfil">
          {(["administrador", "vendedor"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRole(item)}
              className={`flex-1 rounded-lg px-4 py-3 text-sm font-medium capitalize transition ${
                role === item ? "bg-card shadow-sm" : "text-muted-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <form action={action} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="expectedRole" value={role} />
          <label className="flex flex-col gap-2 text-sm font-medium">
            Usuario
            <input
              name="username"
              autoComplete="username"
              required
              className="h-12 rounded-xl border bg-card px-4 font-normal outline-none focus:ring-2 focus:ring-ring"
              placeholder="tu.usuario"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-12 rounded-xl border bg-card px-4 font-normal outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••••••"
            />
          </label>
          {state.error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}
          <SubmitButton
            pendingLabel="Validando..."
            className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition hover:brightness-95 disabled:cursor-wait disabled:opacity-70"
          >
            Entrar al panel <ChevronRight className="size-4" aria-hidden="true" />
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}
