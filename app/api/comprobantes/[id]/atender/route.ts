import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const inputSchema = z.object({ status: z.enum(["atendido", "descartado"]) });

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
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  }
  try {
    const attendedAt = new Date();
    const result = await prisma.recarga_comprobante_fallido.updateMany({
      where: { id_fallo: BigInt(id), estado: "pendiente" },
      data: {
        estado: parsed.data.status,
        agente_panel_id: currentUser.id,
        atendido_at: attendedAt,
        primera_respuesta_at: attendedAt,
        date_update: attendedAt,
      },
    });
    if (result.count !== 1) {
      return NextResponse.json(
        { error: "El comprobante ya fue atendido por otro agente." },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "No fue posible actualizar el comprobante." }, { status: 500 });
  }
}
