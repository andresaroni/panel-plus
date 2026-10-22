import { NextResponse } from "next/server";

import { escalatedFailedReceiptWhere } from "@/lib/failed-receipts";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

class FailedReceiptNotFoundError extends Error {}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  if (currentUser.role !== "administrador") {
    return NextResponse.json({ error: "Solo un administrador puede eliminar comprobantes." }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }
  const { id } = await context.params;
  if (!/^\d{1,20}$/.test(id)) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const failedReceiptId = BigInt(id);
  try {
    await prisma.$transaction(async (transaction) => {
      const item = await transaction.recarga_comprobante_fallido.findFirst({
        where: { AND: [escalatedFailedReceiptWhere, { id_fallo: failedReceiptId }] },
        select: { conversacion_id: true },
      });
      if (!item) throw new FailedReceiptNotFoundError();

      // El caso se borra con sus intentos previos; otro caso escalado de la misma
      // conversación, si lo hubiera, se conserva.
      const retries = await transaction.recarga_comprobante_fallido.findMany({
        where: { conversacion_id: item.conversacion_id, estado: "reintento" },
        select: { id_fallo: true },
      });
      const ids = [failedReceiptId, ...retries.map((retry) => retry.id_fallo)];

      await transaction.panel_push_outbox.deleteMany({
        where: { tipo: "comprobante", solicitud_id: { in: ids } },
      });
      await transaction.panel_push_events.deleteMany({
        where: { tipo: "comprobante", solicitud_id: { in: ids } },
      });
      await transaction.recarga_comprobante_fallido.deleteMany({
        where: { id_fallo: { in: ids } },
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof FailedReceiptNotFoundError) {
      return NextResponse.json({ error: "El comprobante no existe o ya fue eliminado." }, { status: 404 });
    }
    return NextResponse.json({ error: "No fue posible eliminar el comprobante." }, { status: 500 });
  }
}
