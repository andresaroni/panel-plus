"use client";

import { Eye, EyeOff, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { saveUser, type UserActionState } from "@/app/actions/users";

type UserFormData = {
  id: number;
  username: string;
  name: string;
  role: "administrador" | "vendedor";
  status: "activo" | "inactivo";
  isCurrent: boolean;
};

const initialState: UserActionState = {};

export function UserModal({ user }: { user?: UserFormData }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [state, action, pending] = useActionState(saveUser, initialState);

  useEffect(() => {
    if (state.success) {
      router.replace("/usuarios");
      router.refresh();
    }
  }, [router, state.success]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/45 sm:items-center sm:p-5">
      <section role="dialog" aria-modal="true" aria-labelledby="user-title" className="w-full max-w-lg rounded-t-3xl bg-card sm:rounded-2xl">
        <header className="flex items-center justify-between border-b p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Acceso operativo</p>
            <h2 id="user-title" className="mt-1 text-xl font-semibold">{user ? "Editar usuario" : "Nuevo usuario"}</h2>
          </div>
          <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-secondary" aria-label="Cerrar"><X className="size-5" /></button>
        </header>

        <form action={action} className="grid gap-5 p-6">
          {user && <input type="hidden" name="id" value={user.id} />}
          <label className="grid gap-2 text-sm font-medium">
            Nombre completo
            <input name="name" required maxLength={100} defaultValue={user?.name} className="h-11 rounded-xl border bg-background px-3 font-normal" placeholder="Nombre y apellido" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Nombre de acceso
            <div className="flex h-11 items-center rounded-xl border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
              <span className="text-muted-foreground">@</span>
              <input name="username" required minLength={3} maxLength={50} defaultValue={user?.username} className="min-w-0 flex-1 bg-transparent font-normal outline-none" placeholder="usuario" />
            </div>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="grid gap-2 text-sm font-medium">
              Rol
              <select name="role" defaultValue={user?.role ?? "vendedor"} disabled={user?.isCurrent} className="h-11 rounded-xl border bg-background px-3 font-normal disabled:opacity-60">
                <option value="vendedor">Vendedor</option>
                <option value="administrador">Administrador</option>
              </select>
              {user?.isCurrent && <input type="hidden" name="role" value={user.role} />}
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Estado
              <select name="status" defaultValue={user?.status ?? "activo"} disabled={user?.isCurrent} className="h-11 rounded-xl border bg-background px-3 font-normal disabled:opacity-60">
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
              {user?.isCurrent && <input type="hidden" name="status" value={user.status} />}
            </label>
          </div>
          <label className="grid gap-2 text-sm font-medium">
            {user ? "Nueva contraseña (opcional)" : "Contraseña"}
            <div className="flex h-11 items-center rounded-xl border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
              <input name="password" type={showPassword ? "text" : "password"} required={!user} minLength={user ? undefined : 12} maxLength={128} autoComplete="new-password" className="min-w-0 flex-1 bg-transparent font-normal outline-none" placeholder="Mínimo 12 caracteres" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                {showPassword ? <EyeOff className="size-4 text-muted-foreground" /> : <Eye className="size-4 text-muted-foreground" />}
              </button>
            </div>
          </label>

          {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
          <div className="mt-1 flex justify-end gap-3">
            <button type="button" onClick={() => router.back()} className="h-11 rounded-xl border px-5 text-sm font-semibold hover:bg-secondary">Cancelar</button>
            <button disabled={pending} className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60">
              {pending ? "Guardando..." : user ? "Guardar cambios" : "Crear usuario"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
