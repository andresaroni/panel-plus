import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { AGENT_CLOSE_MESSAGE, isWebChatKey } from "@/lib/web-chat";

/** El agente termina la atención: el bot vuelve a responder al cliente. */
export async function POST(request: Request, context: { params: Promise<{ key: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  const { key } = await context.params;
  if (!isWebChatKey(key)) return NextResponse.json({ error: "Conversación inválida." }, { status: 400 });

  try {
    const now = new Date();
    const closed = await prisma.$transaction(async (tx) => {
      const updated = await tx.chat_web_sesion.updateMany({
        where: { conversacion_key: key, modo: "agente" },
        data: { modo: "bot", no_leidos_agente: 0, ultimo_mensaje_at: now, date_update: now },
      });
      if (updated.count !== 1) return false;
      await tx.chat_web_mensajes.create({
        data: {
          conversacion_key: key,
          autor: "agente",
          tipo: "texto",
          texto: AGENT_CLOSE_MESSAGE,
          agente_panel_id: currentUser.id,
          date_create: now,
        },
      });
      return true;
    });
    if (!closed) {
      return NextResponse.json({ error: "El chat ya estaba a cargo del asistente." }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "No fue posible cerrar el chat." }, { status: 500 });
  }
}
