import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isWebChatKey } from "@/lib/web-chat";

const allowedMime = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string; id: string }> },
) {
  if (!(await getCurrentUser())) return new NextResponse(null, { status: 401 });

  const { key, id } = await context.params;
  if (!isWebChatKey(key) || !/^\d{1,20}$/.test(id)) return new NextResponse(null, { status: 400 });

  const record = await prisma.chat_web_mensajes.findFirst({
    where: { id_mensaje: BigInt(id), conversacion_key: key },
    select: { imagen: true, imagen_mime: true },
  });
  if (!record?.imagen) return new NextResponse(null, { status: 404 });

  const mime = record.imagen_mime?.toLowerCase() ?? "";
  if (!allowedMime.has(mime)) return new NextResponse(null, { status: 415 });

  return new NextResponse(record.imagen, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="chat-web-${id}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
