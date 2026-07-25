"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { userSchema } from "@/lib/validation";

export type UserActionState = { error?: string; success?: boolean };

export async function saveUser(
  _previous: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const currentUser = await requireAdmin();
  const rawId = formData.get("id");
  const parsed = userSchema.safeParse({
    id: rawId ? Number(rawId) : undefined,
    username: formData.get("username"),
    name: formData.get("name"),
    role: formData.get("role"),
    status: formData.get("status"),
    password: formData.get("password") || "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    if (!parsed.data.id) {
      await prisma.usuarios.create({
        data: {
          usuario: parsed.data.username,
          nombres: parsed.data.name,
          rol: parsed.data.role,
          estado: parsed.data.status,
          clave: await hashPassword(parsed.data.password),
        },
      });
    } else {
      const targetId = parsed.data.id;
      await prisma.$transaction(
        async (tx) => {
          const existing = await tx.usuarios.findUnique({ where: { id_usuario: targetId } });
          if (!existing) throw new Error("USER_NOT_FOUND");

          if (
            targetId === currentUser.id &&
            (parsed.data.role !== existing.rol || parsed.data.status !== existing.estado)
          ) {
            throw new Error("SELF_ACCESS_CHANGE");
          }

          const removesActiveAdmin =
            existing.rol === "administrador" &&
            existing.estado === "activo" &&
            (parsed.data.role !== "administrador" || parsed.data.status !== "activo");

          if (removesActiveAdmin) {
            const activeAdmins = await tx.usuarios.count({
              where: { rol: "administrador", estado: "activo" },
            });
            if (activeAdmins <= 1) throw new Error("LAST_ADMIN");
          }

          await tx.usuarios.update({
            where: { id_usuario: targetId },
            data: {
              usuario: parsed.data.username,
              nombres: parsed.data.name,
              rol: parsed.data.role,
              estado: parsed.data.status,
              ...(parsed.data.password
                ? { clave: await hashPassword(parsed.data.password) }
                : {}),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    }

    revalidatePath("/usuarios");
    return { success: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ese nombre de usuario ya está registrado." };
    }
    const message = error instanceof Error ? error.message : "";
    if (message === "SELF_ACCESS_CHANGE") {
      return { error: "No puedes cambiar tu propio rol ni desactivar tu cuenta." };
    }
    if (message === "LAST_ADMIN") {
      return { error: "Debe permanecer al menos un administrador activo." };
    }
    if (message === "USER_NOT_FOUND") return { error: "El usuario ya no existe." };
    return { error: "No fue posible guardar el usuario." };
  }
}
