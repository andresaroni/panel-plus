import "server-only";

import type { usuarios_rol } from "@prisma/client";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

type SessionData = {
  userId?: number;
  version?: string;
};

export type CurrentUser = {
  id: number;
  username: string;
  name: string;
  role: usuarios_rol;
};

const sessionOptions = {
  cookieName: "panel_plus_session",
  password: env.SESSION_PASSWORD,
  ttl: 60 * 60 * 8,
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function createSession(userId: number, version: Date) {
  const session = await getSession();
  session.userId = userId;
  session.version = version.toISOString();
  await session.save();
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session.userId || !session.version) return null;

  const user = await prisma.usuarios.findUnique({
    where: { id_usuario: session.userId },
    select: {
      id_usuario: true,
      usuario: true,
      nombres: true,
      rol: true,
      estado: true,
      date_update: true,
    },
  });

  if (
    !user ||
    user.estado !== "activo" ||
    user.date_update.toISOString() !== session.version
  ) {
    return null;
  }

  return {
    id: user.id_usuario,
    username: user.usuario,
    name: user.nombres,
    role: user.rol,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "administrador") redirect("/solicitudes");
  return user;
}
