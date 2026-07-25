import { UserCog } from "lucide-react";
import Link from "next/link";

import { UserModal } from "@/components/user-modal";
import { initials } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string }>;
}) {
  const current = await requireAdmin();
  const params = await searchParams;
  const users = await prisma.usuarios.findMany({
    select: { id_usuario: true, usuario: true, nombres: true, rol: true, estado: true },
    orderBy: [{ estado: "asc" }, { nombres: "asc" }],
  });
  const editUser =
    params.edit && /^\d+$/.test(params.edit)
      ? users.find((user) => user.id_usuario === Number(params.edit))
      : undefined;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Usuarios y roles</h2>
          <p className="mt-1 text-sm text-muted-foreground">Administra el acceso del equipo operativo.</p>
        </div>
        <Link href="/usuarios?new=1" className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95">
          <UserCog className="size-4" /> Nuevo usuario
        </Link>
      </div>

      <section className="mt-7 overflow-hidden rounded-2xl border bg-card">
        <div className="border-b p-5">
          <h3 className="font-semibold">Equipo de operaciones</h3>
          <p className="text-sm text-muted-foreground">{users.length} usuarios registrados</p>
        </div>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Usuario</th>
                <th className="px-5 py-3">Nombre de acceso</th>
                <th className="px-5 py-3">Rol</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => (
                <tr key={user.id_usuario} className="hover:bg-secondary/25">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-bold">{initials(user.nombres)}</span>
                      <div>
                        <p className="font-medium">{user.nombres}</p>
                        {user.id_usuario === current.id && <p className="text-[11px] text-primary">Tu cuenta</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">@{user.usuario}</td>
                  <td className="px-5 py-4 capitalize">{user.rol}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${user.estado === "activo" ? "text-foreground" : "text-muted-foreground"}`}>
                      <span className={`size-1.5 rounded-full ${user.estado === "activo" ? "bg-primary" : "bg-stone-400"}`} />
                      <span className="capitalize">{user.estado}</span>
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <Link href={`/usuarios?edit=${user.id_usuario}`} className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-secondary">Editar</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {params.new === "1" && <UserModal />}
      {editUser && (
        <UserModal
          user={{
            id: editUser.id_usuario,
            username: editUser.usuario,
            name: editUser.nombres,
            role: editUser.rol,
            status: editUser.estado,
            isCurrent: editUser.id_usuario === current.id,
          }}
        />
      )}
    </div>
  );
}
