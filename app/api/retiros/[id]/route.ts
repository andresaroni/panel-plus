import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const CANCELLABLE_STATUSES = new Set([
  "borrador",
  "pendiente",
]);

type LockedWithdrawal = {
  conversacion_id: bigint;
  estado: string;
  aplicado_at: Date | null;
  reporte_plataforma_id: number | null;
  comprobante_enviado_at: Date | null;
  primera_respuesta_at: Date | null;
};

class WithdrawalNotFoundError extends Error {}
class WithdrawalConflictError extends Error {}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  const { id } = await context.params;
  if (!/^\d{1,20}$/.test(id)) {
    return NextResponse.json({ error: "Retiro inválido." }, { status: 400 });
  }

  const withdrawalId = BigInt(id);
  try {
    await prisma.$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRaw<LockedWithdrawal[]>`
          SELECT conversacion_id, estado, aplicado_at, reporte_plataforma_id,
                 comprobante_enviado_at, primera_respuesta_at
          FROM retirar_saldo
          WHERE id_retiro = ${withdrawalId}
          FOR UPDATE
        `;
        const withdrawal = rows[0];
        if (!withdrawal) throw new WithdrawalNotFoundError();
        if (
          !CANCELLABLE_STATUSES.has(withdrawal.estado) ||
          withdrawal.aplicado_at !== null ||
          withdrawal.reporte_plataforma_id !== null ||
          withdrawal.comprobante_enviado_at !== null
        ) {
          throw new WithdrawalConflictError();
        }

        await transaction.$queryRaw`
          SELECT id_recarga
          FROM recarga_whatsapp
          WHERE id_recarga = ${withdrawal.conversacion_id}
          FOR UPDATE
        `;
        await transaction.recarga_whatsapp.updateMany({
          where: { id_recarga: withdrawal.conversacion_id },
          data: { fase: "finalizada" },
        });
        await transaction.panel_push_outbox.deleteMany({
          where: { tipo: "retiro", solicitud_id: withdrawalId },
        });
        await transaction.panel_push_events.deleteMany({
          where: { tipo: "retiro", solicitud_id: withdrawalId },
        });
        const cancelledAt = new Date();
        const cancelled = await transaction.retirar_saldo.updateMany({
          where: {
            id_retiro: withdrawalId,
            estado: { in: ["borrador", "pendiente"] },
            aplicado_at: null,
            reporte_plataforma_id: null,
            comprobante_enviado_at: null,
          },
          data: {
            estado: "cancelado",
            agente_panel_id: currentUser.id,
            agente_usuario_id: currentUser.id,
            revisado_at: cancelledAt,
            motivo_rechazo: null,
            procesando_token: null,
            procesando_hasta: null,
            notificacion_token: null,
            notificacion_hasta: null,
            primera_respuesta_at: withdrawal.primera_respuesta_at ?? cancelledAt,
            date_update: cancelledAt,
          },
        });
        if (cancelled.count !== 1) throw new WithdrawalConflictError();
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof WithdrawalNotFoundError) {
      return NextResponse.json({ error: "El retiro no existe." }, { status: 404 });
    }
    if (error instanceof WithdrawalConflictError) {
      return NextResponse.json(
        { error: "El retiro ya fue pagado, aplicado o cambió mientras se procesaba." },
        { status: 409 },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: "No fue posible cancelar el retiro." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "No fue posible cancelar el retiro." },
      { status: 500 },
    );
  }
}
