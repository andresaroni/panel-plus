"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import {
  clearLoginFailures,
  isLoginBlocked,
  registerLoginFailure,
} from "@/lib/rate-limit";
import { createSession, getSession } from "@/lib/session";
import { loginSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/password";

const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$OQEcpKor5/DSjUQRKQTnRQ$SOAjVVuZ1xljdS50iC2xXtAcbZ7dZ/GrB5RbR4ZaGPE";

export type AuthState = { error?: string };

export async function loginAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    expectedRole: formData.get("expectedRole"),
  });

  if (!parsed.success) return { error: "Credenciales inválidas." };

  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limitKey = `${ip}:${parsed.data.username}`;

  if (isLoginBlocked(limitKey)) {
    return { error: "Demasiados intentos. Intenta nuevamente en 15 minutos." };
  }

  const user = await prisma.usuarios.findUnique({
    where: { usuario: parsed.data.username },
  });
  const validPassword = await verifyPassword(user?.clave ?? DUMMY_HASH, parsed.data.password);
  const validUser =
    user &&
    validPassword &&
    user.estado === "activo" &&
    user.rol === parsed.data.expectedRole;

  if (!validUser) {
    registerLoginFailure(limitKey);
    return { error: "Credenciales inválidas." };
  }

  clearLoginFailures(limitKey);
  await createSession(user.id_usuario, user.date_update);
  redirect("/solicitudes");
}

export async function logoutAction() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
