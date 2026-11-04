import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isWebChatKey, serializeWebChatMessage } from "@/lib/web-chat";

type Context = { params: Promise<{ key: string }> };

const messageSelect = {
  id_mensaje: true,
  conversacion_key: true,
  autor: true,
  tipo: true,
  texto: true,
  opciones: true,
  boton: true,
  imagen_mime: true,
  agente_panel_id: true,
  date_create: true,
} as const;

/** Historial del chat web de un cliente (el panel lo consulta por polling). */
export async function GET(request: Request, context: Context) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const { key } = await context.params;
  if (!isWebChatKey(key)) return NextResponse.json({ error: "Conversación inválida." }, { status: 400 });

  const afterParam = new URL(request.url).searchParams.get("after") ?? "0";
  const after = /^\d{1,20}$/.test(afterParam) ? BigInt(afterParam) : BigInt(0);

  const session = await prisma.chat_web_sesion.findUnique({
    where: { conversacion_key: key },
    select: { modo: true, nombre: true, cedula: true, agente_panel_id: true },
  });
  if (!session) return NextResponse.json({ error: "El cliente aún no tiene chat web." }, { status: 404 });

  const rows = after > BigInt(0)
    ? await prisma.chat_web_mensajes.findMany({
        where: { conversacion_key: key, id_mensaje: { gt: after } },
        orderBy: { id_mensaje: "asc" },
        take: 200,
        select: messageSelect,
      })
    : (
        await prisma.chat_web_mensajes.findMany({
          where: { conversacion_key: key },
          orderBy: { id_mensaje: "desc" },
          take: 200,
          select: messageSelect,
        })
      ).reverse();

  // El agente está viendo el chat: lo pendiente queda leído.
  await prisma.chat_web_sesion.update({
    where: { conversacion_key: key },
    data: { no_leidos_agente: 0 },
  });

  return NextResponse.json({
    mode: session.modo,
    client: { name: session.nombre, cedula: session.cedula },
    messages: rows.map((row) => serializeWebChatMessage(row, row.tipo === "imagen" && !!row.imagen_mime)),
  });
}

const replySchema = z.object({ text: z.string().trim().min(1).max(2000) });

/** El agente responde: el mensaje aparece en el widget y el bot deja de contestar. */
export async function POST(request: Request, context: Context) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  const { key } = await context.params;
  if (!isWebChatKey(key)) return NextResponse.json({ error: "Conversación inválida." }, { status: 400 });

  const parsed = replySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Escribe un mensaje de hasta 2000 caracteres." }, { status: 422 });
  }

  try {
    const now = new Date();
    const message = await prisma.$transaction(async (tx) => {
      const updated = await tx.chat_web_sesion.updateMany({
        where: { conversacion_key: key },
        data: {
          modo: "agente",
          agente_panel_id: currentUser.id,
          ultimo_agente_at: now,
          ultimo_mensaje_at: now,
          no_leidos_agente: 0,
          date_update: now,
        },
      });
      if (updated.count !== 1) return null;
      return tx.chat_web_mensajes.create({
        data: {
          conversacion_key: key,
          autor: "agente",
          tipo: "texto",
          texto: parsed.data.text,
          agente_panel_id: currentUser.id,
          date_create: now,
        },
        select: messageSelect,
      });
    });
    if (!message) return NextResponse.json({ error: "El cliente aún no tiene chat web." }, { status: 404 });
    return NextResponse.json({ message: serializeWebChatMessage(message, false) });
  } catch {
    return NextResponse.json({ error: "No fue posible enviar el mensaje." }, { status: 500 });
  }
}
