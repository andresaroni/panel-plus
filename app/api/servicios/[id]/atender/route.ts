import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }
  const { id } = await context.params;
  if (!/^\d{1,20}$/.test(id)) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  try {
    const attendedAt = new Date();
    const result = await prisma.solicitudes_servicio.updateMany({
      where: { id_solicitud: BigInt(id), estado: "pendiente" },
      data: {
        estado: "atendido",
        agente_panel_id: currentUser.id,
        agente_usuario_id: currentUser.id,
        atendido_at: attendedAt,
        cancelado_at: null,
        primera_respuesta_at: attendedAt,
        date_update: attendedAt,
      },
    });
    if (result.count !== 1) {
      return NextResponse.json(
        { error: "La solicitud ya fue atendida o procesada por otro agente." },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "No fue posible actualizar la solicitud." }, { status: 500 });
  }
}
